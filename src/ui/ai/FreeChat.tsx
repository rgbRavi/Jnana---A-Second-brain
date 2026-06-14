import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiConfig, Note, ProjectKnowledge, StoredConversation } from '../../types'
import {
  streamChat,
  buildUserTurn,
  pickAttachments,
  makeNoteAttachment,
  modelCapabilities,
  hasDeepResearchEndpoint,
  type ChatTurn,
  type ChatAttachment,
  type StreamRoute,
} from '../../core/ai'
import { buildPresetSystem, buildProjectGrounding, listProjectKnowledge } from '../../core/aiWorkspace'
import { useViewState, getViewState } from '../../hooks/useViewState'
import { useChatHistory } from '../../hooks/useChatHistory'
import { usePresets } from '../../hooks/usePresets'
import { useProjects } from '../../hooks/useProjects'
import { eventBus } from '../../lib/eventBus'
import { ChatComposer } from './ChatComposer'
import { PresetPicker } from './PresetPicker'
import { ProjectBar } from './ProjectBar'
import styles from './Ai.module.css'

const titleFrom = (messages: FreeMessage[]): string => {
  const firstUser = messages.find((m) => m.role === 'user')
  return (firstUser?.displayText ?? firstUser?.content ?? 'New chat').slice(0, 60)
}

/** A message in the free-chat thread. `content` is the model-facing text;
 *  `displayText` (user only) is the raw text shown in the bubble. */
interface FreeMessage {
  role: 'user' | 'assistant'
  content: string
  displayText?: string
  attachments?: ChatAttachment[]
  pending?: boolean
}

const chipStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: '999px',
  padding: '0.15rem 0.55rem',
  fontSize: '0.72rem',
  color: 'var(--text-3)',
}

export function FreeChat({ config, notes }: { config: AiConfig; notes: Note[] }) {
  // Persisted via useViewState: the thread survives view switches AND an
  // in-flight stream keeps writing here even if you navigate away (the setters
  // are store-bound, not tied to this component instance).
  const [messages, setMessages] = useViewState<FreeMessage[]>('ai.free.messages', [])
  const [input, setInput] = useViewState('ai.free.input', '')
  const [attachments, setAttachments] = useViewState<ChatAttachment[]>('ai.free.attachments', [])
  const [think, setThink] = useViewState('ai.free.think', true)
  const [deepResearch, setDeepResearch] = useViewState('ai.free.deepResearch', false)
  const [busy, setBusy] = useViewState('ai.free.busy', false)
  const [error, setError] = useViewState<string | null>('ai.free.error', null)

  // Styles & Skills (presets) — selection persists across view switches.
  const { styles: stylePresets, skills: skillPresets, refresh: refreshPresets } = usePresets()
  const [styleId, setStyleId] = useViewState('ai.free.styleId', '')
  const [skillIds, setSkillIds] = useViewState<string[]>('ai.free.skillIds', [])

  // Projects — the active project grounds the chat with its instructions + knowledge.
  const { projects, refresh: refreshProjects } = useProjects()
  const [projectId, setProjectId] = useViewState('ai.free.projectId', '')
  const [projectKnowledge, setProjectKnowledge] = useState<ProjectKnowledge[]>([])
  useEffect(() => {
    if (!projectId) {
      setProjectKnowledge([])
      return
    }
    listProjectKnowledge(projectId)
      .then(setProjectKnowledge)
      .catch(() => setProjectKnowledge([]))
  }, [projectId])

  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const caps = modelCapabilities(config.chatModel)

  // History wiring: load/new come from the drawer via the eventBus.
  const resetChat = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
    setInput('')
    setAttachments([])
  }, [setMessages, setError, setInput, setAttachments])

  const loadConv = useCallback(
    (c: StoredConversation) => {
      abortRef.current?.abort()
      try {
        setMessages(JSON.parse(c.messages) as FreeMessage[])
      } catch {
        setMessages([])
      }
      setError(null)
      setInput('')
      setAttachments([])
    },
    [setMessages, setError, setInput, setAttachments],
  )

  const { persist } = useChatHistory('chat', loadConv, resetChat)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const handleAttach = async () => {
    try {
      const picked = await pickAttachments()
      if (picked.length) setAttachments((prev) => [...prev, ...picked])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id))

  const addNote = async (note: Note) => {
    // Avoid duplicates.
    if (attachments.some((a) => a.noteId === note.id)) return
    try {
      const att = await makeNoteAttachment(note)
      setAttachments((prev) => [...prev, att])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const toggleThread = (id: string) =>
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, includeThread: !a.includeThread } : a)))

  // Route through the bus so the history hook resets the active id too.
  const newChat = () => eventBus.emit('ai:newChat', { mode: 'chat' })

  const send = async () => {
    if (busy) return
    const text = input.trim()
    const atts = attachments
    if (!text && atts.length === 0) return

    setError(null)
    setBusy(true)
    setInput('')
    setAttachments([])

    // Capture prior turns before we append the new message.
    const prior: ChatTurn[] = messages.map((m) => ({ role: m.role, content: m.content }))

    let userTurn: ChatTurn
    let warnings: string[] = []
    try {
      const built = await buildUserTurn(text, atts, config.chatModel, notes)
      userTurn = built.turn
      warnings = built.warnings
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : String(e))
      return
    }

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userTurn.content, displayText: text, attachments: atts },
      { role: 'assistant', content: '', pending: true },
    ])
    if (warnings.length) setError(warnings.join('  '))

    // Deep research routes to its own endpoint when one is configured; otherwise
    // it's a best-effort system-prompt directive on the normal chat model.
    const useDrEndpoint = deepResearch && hasDeepResearchEndpoint(config)
    const route: StreamRoute | undefined = useDrEndpoint
      ? { target: 'deepResearch', provider: config.deepResearchProvider, model: config.deepResearchModel }
      : undefined

    // System prompt = project grounding + selected Style + Skills (+ deep-research).
    const systemParts: string[] = []
    const activeProject = projects.find((p) => p.id === projectId)
    if (activeProject) {
      try {
        const grounding = await buildProjectGrounding(activeProject, projectKnowledge, notes)
        if (grounding) systemParts.push(grounding)
      } catch (e) {
        console.error('Failed to build project grounding:', e)
      }
    }
    const presetSystem = buildPresetSystem(
      stylePresets.find((s) => s.id === styleId),
      skillPresets.filter((s) => skillIds.includes(s.id)),
    )
    if (presetSystem) systemParts.push(presetSystem)
    if (deepResearch && !useDrEndpoint) {
      systemParts.push(
        'Reason thoroughly and methodically: break the problem into steps, weigh multiple angles, and give a comprehensive, well-structured answer.',
      )
    }
    const system: ChatTurn[] = systemParts.length ? [{ role: 'system', content: systemParts.join('\n\n') }] : []
    const turns: ChatTurn[] = [...system, ...prior, userTurn]

    const controller = new AbortController()
    abortRef.current = controller

    const onToken = (delta: string) =>
      setMessages((prev) => {
        const next = prev.slice()
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + delta }
        return next
      })

    try {
      await streamChat(config, turns, { think, signal: controller.signal, route }, onToken)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      abortRef.current = null
      setBusy(false)
      setMessages((prev) => {
        const next = prev.slice()
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') next[next.length - 1] = { ...last, pending: false }
        return next
      })
      // Persist the conversation (reads the freshly-updated store, so it works
      // even if we've navigated away while streaming).
      const finalMessages = getViewState<FreeMessage[]>('ai.free.messages') ?? []
      void persist(finalMessages, null, titleFrom(finalMessages), getViewState<string>('ai.free.projectId') || null)
    }
  }

  if (!config.enabled) {
    return (
      <div className={styles.panel}>
        <p className={styles.disabledNote}>
          AI is disabled. Open <strong>Settings</strong>, enable it and set a chat provider to use AI Chat.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header: project + model + new chat */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', paddingBottom: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <ProjectBar projects={projects} projectId={projectId} onProjectId={setProjectId} notes={notes} onChanged={refreshProjects} />
          <span className={styles.scopeLabel}>
            {config.chatProvider} · {config.chatModel || 'no model set'}
          </span>
        </div>
        {messages.length > 0 && (
          <button className={styles.btn} onClick={newChat} style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}>
            + New chat
          </button>
        )}
      </div>

      {/* Scrollable message area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingBottom: '0.5rem' }}>
          {messages.length === 0 ? (
            <p className={styles.hint} style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              Ask anything, or attach a document/image/audio or one of your notes. This is a normal chatbot —
              your notes aren't auto-searched here (use Focused AI Assist for that).
            </p>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                  <p className={styles.chatQ}>{m.displayText ?? m.content}</p>
                  {m.attachments && m.attachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'flex-end' }}>
                      {m.attachments.map((a) => (
                        <span key={a.id} style={chipStyle}>
                          {a.kind === 'note' ? '📝 ' : ''}
                          {a.name}
                          {a.kind === 'note' && a.includeThread ? ` + thread (${a.threadCount ?? ''})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div key={i} className={styles.chatA}>
                  {m.content ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                  ) : (
                    <span className={styles.spinner}>{m.pending ? 'Thinking…' : ''}</span>
                  )}
                </div>
              ),
            )
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && (
        <p className={styles.error} style={{ maxWidth: '760px', margin: '0.25rem auto 0', width: '100%' }}>
          {error}
        </p>
      )}

      {/* Composer pinned to the bottom */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={send}
            onStop={() => abortRef.current?.abort()}
            busy={busy}
            attachments={attachments}
            onAttach={handleAttach}
            onRemoveAttachment={removeAttachment}
            onToggleThread={toggleThread}
            notes={notes}
            onAddNote={addNote}
            think={think}
            onThinkChange={setThink}
            canThink={caps.thinking}
            deepResearch={deepResearch}
            onDeepResearchChange={setDeepResearch}
            vision={caps.vision}
            presetControls={
              <PresetPicker
                styles={stylePresets}
                skills={skillPresets}
                styleId={styleId}
                onStyleId={setStyleId}
                skillIds={skillIds}
                onSkillIds={setSkillIds}
                onChanged={refreshPresets}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
