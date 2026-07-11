// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiConfig, Note, ProjectKnowledge, StoredConversation } from '../../types'
import {
  streamChat,
  buildUserTurn,
  pickAttachments,
  makeNoteAttachment,
  modelCapabilities,
  hasDeepResearchEndpoint,
  runAgent,
  type ChatTurn,
  type ChatAttachment,
  type StreamRoute,
  type AgentMessage,
  type AgentStep,
  type ProposedAction,
} from '../../core/ai'
import { buildPresetSystem, buildProjectGrounding, listProjectKnowledge } from '../../core/aiWorkspace'
import { useViewState, getViewState } from '../../hooks/useViewState'
import { useChatHistory } from '../../hooks/useChatHistory'
import { usePresets } from '../../hooks/usePresets'
import { useProjects } from '../../hooks/useProjects'
import { useNotesContext } from '../../context/NotesContext'
import { eventBus } from '../../lib/eventBus'
import { ChatComposer } from './ChatComposer'
import { PresetPicker } from './PresetPicker'
import { ProjectBar } from './ProjectBar'
import { AgentSteps } from './AgentSteps'
import { ProposalCard } from './ProposalCard'
import styles from './Ai.module.css'

const titleFrom = (messages: FreeMessage[]): string => {
  const firstUser = messages.find((m) => m.role === 'user')
  return (firstUser?.displayText ?? firstUser?.content ?? 'New chat').slice(0, 60)
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

/** A message in the free-chat thread. `content` is the model-facing text;
 *  `displayText` (user only) is the raw text shown in the bubble. */
interface FreeMessage {
  role: 'user' | 'assistant'
  content: string
  displayText?: string
  attachments?: ChatAttachment[]
  pending?: boolean
  // Agent runs attach their steps + proposed actions to the assistant message.
  steps?: AgentStep[]
  proposals?: ProposedAction[]
  appliedIds?: string[]
  skippedIds?: string[]
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
  const [agent, setAgent] = useViewState('ai.free.agent', false)
  const [busy, setBusy] = useViewState('ai.free.busy', false)
  const [error, setError] = useViewState<string | null>('ai.free.error', null)

  // Note mutations for applying agent proposals.
  const { create, update } = useNotesContext()

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

  // Per-message actions (right-click) + inline edit.
  const [msgMenu, setMsgMenu] = useState<{ index: number; x: number; y: number } | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')

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

  const { persist, setActiveId } = useChatHistory('chat', loadConv, resetChat)

  const persistNow = useCallback(() => {
    const m = getViewState<FreeMessage[]>('ai.free.messages') ?? []
    void persist(m, null, titleFrom(m), getViewState<string>('ai.free.projectId') || null)
  }, [persist])

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

  const send = async (opts?: { text?: string; atts?: ChatAttachment[] }) => {
    if (busy) return
    // `opts.text` is set by edit-&-retry; otherwise use the composer.
    const explicit = typeof opts?.text === 'string'
    const text = (explicit ? (opts!.text as string) : input).trim()
    const atts = opts?.atts ?? (explicit ? [] : attachments)
    if (!text && atts.length === 0) return

    setError(null)
    setBusy(true)
    if (!explicit) {
      setInput('')
      setAttachments([])
    }

    // Capture prior turns from the store (fresh — edit-&-retry truncates first).
    const prior: ChatTurn[] = (getViewState<FreeMessage[]>('ai.free.messages') ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }))

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

    // ── Agent mode: tool-loop over the vault (writes staged as proposals) ──
    if (agent) {
      const history: AgentMessage[] = prior.map((m) => ({ role: m.role, content: m.content }))
      const onStep = (s: AgentStep) =>
        setMessages((p) => {
          const next = p.slice()
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') next[next.length - 1] = { ...last, steps: [...(last.steps ?? []), s] }
          return next
        })
      try {
        const result = await runAgent(config, userTurn.content, history, notes, { onStep })
        setMessages((p) => {
          const next = p.slice()
          const last = next[next.length - 1]
          if (last && last.role === 'assistant')
            next[next.length - 1] = { ...last, content: result.answer, steps: result.steps, proposals: result.proposals, pending: false }
          return next
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setMessages((p) => {
          const next = p.slice()
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') next[next.length - 1] = { ...last, pending: false }
          return next
        })
      } finally {
        setBusy(false)
        const finalMessages = getViewState<FreeMessage[]>('ai.free.messages') ?? []
        void persist(finalMessages, null, titleFrom(finalMessages), getViewState<string>('ai.free.projectId') || null)
      }
      return
    }

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

  // ── Applying agent proposals (the confirm half of propose-then-confirm) ──
  const noteByTitle = (title?: string): Note | undefined => {
    const t = (title ?? '').trim().toLowerCase()
    return notes.find((n) => (n.title ?? '').trim().toLowerCase() === t)
  }

  const applyProposal = async (msgIndex: number, p: ProposedAction) => {
    try {
      if (p.kind === 'create') {
        await create(p.title || 'Untitled', p.content || '', undefined, p.tags ?? [])
      } else if (p.kind === 'append') {
        const note = notes.find((n) => n.id === p.noteId)
        if (note) await update(note.id, note.title, `${note.content.trimEnd()}\n\n${p.text ?? ''}`.trim())
      } else if (p.kind === 'tags') {
        const note = notes.find((n) => n.id === p.noteId)
        if (note) await update(note.id, note.title, note.content, p.tags ?? [])
      } else if (p.kind === 'link') {
        const src = noteByTitle(p.sourceTitle)
        if (!src) throw new Error(`Apply “Create ${p.sourceTitle}” first (or use Apply all).`)
        const wl = `[[${p.targetTitle}]]`
        if (!src.content.includes(wl)) await update(src.id, src.title, `${src.content.trimEnd()}\n\n${wl}\n`)
      }
      setMessages((prev) =>
        prev.map((m, i) => (i === msgIndex ? { ...m, appliedIds: [...(m.appliedIds ?? []), p.id] } : m)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** Apply every pending proposal as a batch. All edits to a note (links/
   *  appends/tags) accumulate into ONE save — and a *new* note is created exactly
   *  once with its links already in the content. Saving a created note twice
   *  (create then update) makes the first save's empty-link sync race the
   *  second's and delete the just-added links, which is why links showed in the
   *  note but not the graph. */
  const applyAllProposals = async (msgIndex: number) => {
    const msg = (getViewState<FreeMessage[]>('ai.free.messages') ?? [])[msgIndex]
    if (!msg?.proposals) return
    const pending = msg.proposals.filter((p) => !msg.appliedIds?.includes(p.id) && !msg.skippedIds?.includes(p.id))
    if (pending.length === 0) return

    type Edit = { id?: string; title: string; content: string; tags?: string[]; isNew: boolean }
    const edits = new Map<string, Edit>() // key = lowercased title
    const resolveEdit = (title?: string): Edit | undefined => {
      const key = (title ?? '').trim().toLowerCase()
      if (!key) return undefined
      const existing = edits.get(key)
      if (existing) return existing
      const note = noteByTitle(title)
      if (!note) return undefined
      const e: Edit = { id: note.id, title: note.title, content: note.content, isNew: false }
      edits.set(key, e)
      return e
    }

    // Register creates first so links can target a note this batch will make.
    for (const p of pending.filter((p) => p.kind === 'create')) {
      edits.set((p.title ?? '').trim().toLowerCase(), { title: p.title || 'Untitled', content: p.content || '', tags: p.tags ?? [], isNew: true })
    }
    for (const p of pending.filter((p) => p.kind !== 'create')) {
      if (p.kind === 'append') {
        const note = notes.find((n) => n.id === p.noteId)
        const e = note ? resolveEdit(note.title) : undefined
        if (e) e.content = `${e.content.trimEnd()}\n\n${p.text ?? ''}`.trim()
      } else if (p.kind === 'tags') {
        const note = notes.find((n) => n.id === p.noteId)
        const e = note ? resolveEdit(note.title) : undefined
        if (e) e.tags = p.tags ?? []
      } else if (p.kind === 'link') {
        const e = resolveEdit(p.sourceTitle)
        const wl = `[[${p.targetTitle}]]`
        if (e && !e.content.includes(wl)) e.content = `${e.content.trimEnd()}\n\n${wl}\n`
      }
    }

    try {
      for (const e of edits.values()) {
        if (e.isNew) await create(e.title, e.content, undefined, e.tags ?? [])
        else await update(e.id as string, e.title, e.content, e.tags)
      }
      setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, appliedIds: [...(m.appliedIds ?? []), ...pending.map((p) => p.id)] } : m)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const skipProposal = (msgIndex: number, id: string) =>
    setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, skippedIds: [...(m.skippedIds ?? []), id] } : m)))

  // ── Per-message actions ──
  const deleteMessage = (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index))
    setMsgMenu(null)
    persistNow()
  }
  const deleteFrom = (index: number) => {
    setMessages((prev) => prev.slice(0, index))
    setMsgMenu(null)
    persistNow()
  }
  const forkFrom = (index: number) => {
    const all = getViewState<FreeMessage[]>('ai.free.messages') ?? []
    const slice = all.slice(0, index + 1)
    setActiveId(newId())
    setMessages(slice)
    setMsgMenu(null)
    persistNow()
  }
  const startEdit = (index: number) => {
    const m = messages[index]
    setEditText(m.displayText ?? m.content)
    setEditingIndex(index)
    setMsgMenu(null)
  }
  const submitEdit = async () => {
    const idx = editingIndex
    const text = editText.trim()
    setEditingIndex(null)
    if (idx == null || !text) return
    setMessages((prev) => prev.slice(0, idx)) // drop the old message + everything after
    await send({ text })
  }
  const openMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault()
    setMsgMenu({ index, x: e.clientX, y: e.clientY })
  }
  /** Re-run a user prompt: drop everything from it onward, then resend it. */
  const retryMessage = async (index: number) => {
    const m = messages[index]
    if (!m || m.role !== 'user') return
    const text = m.displayText ?? m.content
    const atts = m.attachments ?? []
    setMsgMenu(null)
    setMessages((prev) => prev.slice(0, index))
    await send({ text, atts })
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
                <div
                  key={i}
                  onContextMenu={(e) => openMenu(e, i)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}
                >
                  {editingIndex === i ? (
                    <div style={{ width: '100%', maxWidth: '85%' }}>
                      <textarea
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            void submitEdit()
                          }
                          if (e.key === 'Escape') setEditingIndex(null)
                        }}
                        style={{ width: '100%', minHeight: '60px', background: 'var(--bg)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', color: 'var(--text-1)', padding: '0.5rem', fontSize: '0.88rem', fontFamily: 'var(--font-body)', resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '0.3rem' }}>
                        <button className={styles.btn} style={{ padding: '0.25rem 0.7rem', fontSize: '0.76rem' }} onClick={() => setEditingIndex(null)}>
                          Cancel
                        </button>
                        <button className={styles.btnPrimary} style={{ padding: '0.25rem 0.7rem', fontSize: '0.76rem' }} onClick={() => void submitEdit()}>
                          Send
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
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
                      <button
                        onClick={() => void retryMessage(i)}
                        disabled={busy}
                        title="Retry this prompt"
                        aria-label="Retry this prompt"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-3)',
                          cursor: busy ? 'not-allowed' : 'pointer',
                          fontSize: '0.9rem',
                          lineHeight: 1,
                          padding: '2px 4px',
                        }}
                      >
                        ↻
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div
                  key={i}
                  onContextMenu={(e) => openMenu(e, i)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem', width: '100%' }}
                >
                  {m.steps && m.steps.length > 0 && <AgentSteps steps={m.steps} />}
                  <div className={styles.chatA}>
                    {m.content ? (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                    ) : (
                      <span className={styles.spinner}>{m.pending ? (m.steps?.length ? 'Working…' : 'Thinking…') : ''}</span>
                    )}
                  </div>
                  {m.proposals && m.proposals.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className={styles.scopeLabel}>Proposed changes</span>
                        {m.proposals.some((p) => !m.appliedIds?.includes(p.id) && !m.skippedIds?.includes(p.id)) && (
                          <button
                            className={styles.btn}
                            style={{ padding: '0.2rem 0.6rem', fontSize: '0.74rem' }}
                            onClick={() => void applyAllProposals(i)}
                          >
                            Apply all
                          </button>
                        )}
                      </div>
                      {m.proposals.map((p) => (
                        <ProposalCard
                          key={p.id}
                          action={p}
                          applied={!!m.appliedIds?.includes(p.id)}
                          skipped={!!m.skippedIds?.includes(p.id)}
                          onApply={() => applyProposal(i, p)}
                          onSkip={() => skipProposal(i, p.id)}
                        />
                      ))}
                    </div>
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
            onSend={() => void send()}
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
            agent={agent}
            onAgentChange={setAgent}
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

      {/* Per-message right-click menu */}
      {msgMenu && (
        <>
          <div onClick={() => setMsgMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMsgMenu(null) }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'fixed',
              top: Math.min(msgMenu.y, window.innerHeight - 200),
              left: Math.min(msgMenu.x, window.innerWidth - 230),
              zIndex: 41,
              width: '220px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 12px 34px rgba(0,0,0,0.5)',
              padding: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {messages[msgMenu.index]?.role === 'user' && (
              <MenuItem onClick={() => startEdit(msgMenu.index)}>✎ Edit &amp; retry</MenuItem>
            )}
            <MenuItem onClick={() => forkFrom(msgMenu.index)}>⑂ Fork from here</MenuItem>
            <MenuItem onClick={() => deleteFrom(msgMenu.index)}>⤓ Delete from here</MenuItem>
            <MenuItem danger onClick={() => deleteMessage(msgMenu.index)}>🗑 Delete message</MenuItem>
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        color: danger ? '#e5484d' : 'var(--text-1)',
        fontSize: '0.82rem',
        padding: '0.5rem 0.6rem',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? 'rgba(229,72,77,0.12)' : 'var(--surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}
