// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useRef, useState } from 'react'
import { GitFork, ListX, Pencil, RotateCcw, Trash2, ChevronDown, Star, EyeOff, FolderMinus, Trash, FolderInput } from 'lucide-react'
import type { AiConfig, AiRule, AnalysisResult, Note, ProjectKnowledge, QuizAttempt, SourceNote, StoredConversation } from '../../types'
import {
  streamChat,
  buildUserTurn,
  pickAttachments,
  makeNoteAttachment,
  modelCapabilities,
  hasDeepResearchEndpoint,
  runAgent,
  analyze,
  askNotes,
  generateQuiz,
  type AskTurn,
  type ChatTurn,
  type ChatAttachment,
  type StreamRoute,
  type AgentMessage,
  type AgentStep,
  type ProposedAction,
} from '../../core/ai'
import { emptyAttempt } from '../../core/ai/quizGrade'
import { buildScope, scopeLabel, scopeHint, emptyFocus, ACTION_VERB, type FocusState } from '../../core/ai/focusedScope'
import { getConversation, renameConversation, deleteConversation, saveConversation } from '../../core/chat'
import { buildPresetSystem, buildProjectGrounding, listProjectKnowledge } from '../../core/aiWorkspace'
import { listRules, listProjectRules, resolveEffectiveRules, buildRulesSystem } from '../../core/aiRules'
import { estimateTokens } from '../../core/ai/ruleEngine'
import { selectRulesForSend } from '../../core/ai/ruleSelect'
import { decideRefresh } from '../../core/ai/ruleDecide'
import { recordRuleEvent } from '../../core/ai/ruleMetrics'
import { getAdvancedAiSettings } from '../../hooks/useAdvancedAiSettings'
import { useQuizSettings } from '../../hooks/useQuizSettings'
import { useViewState, getViewState, setViewState } from '../../hooks/useViewState'
import { useChatHistory } from '../../hooks/useChatHistory'
import { usePresets } from '../../hooks/usePresets'
import { useProjects } from '../../hooks/useProjects'
import { getActiveVaultId } from '../../hooks/useVaults'
import { useNotesContext } from '../../context/NotesContext'
import { serializeAttempt } from '../../plugins/quiz/quizNote'
import { QUIZ_NOTE_KIND } from '../../plugins/quiz'
import { closeFocusPanel } from '../../lib/activeFocus'
import { toast } from '../../lib/toast'
import { log } from '../../lib/logger'
import { eventBus } from '../../lib/eventBus'
import { ChatComposer } from './ChatComposer'
import { AgentSteps } from './AgentSteps'
import { AnalysisCard } from './AnalysisCard'
import { QuizRunner } from './QuizRunner'
import { ProposalCard } from './ProposalCard'
import styles from './Ai.module.css'

const titleFrom = (messages: FreeMessage[]): string => {
  const firstUser = messages.find((m) => m.role === 'user')
  return (firstUser?.displayText ?? firstUser?.content ?? 'New chat').slice(0, 60)
}

/** Pair prior question→answer text turns for askNotes history (skips cards). */
const toAskHistory = (msgs: FreeMessage[]): AskTurn[] => {
  const turns: AskTurn[] = []
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    const next = msgs[i + 1]
    if (m.role === 'user' && next && next.role === 'assistant' && !next.card && next.content) {
      turns.push({ question: m.displayText ?? m.content, answer: next.content })
    }
  }
  return turns
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

/** A grounded ("Focused") result rendered as an assistant card. Serializable
 *  data only (no React nodes) so it round-trips through the conversation JSON. */
type FreeCard =
  | { type: 'analysis'; result: AnalysisResult }
  | { type: 'quiz'; attempt: QuizAttempt; reason?: 'empty-index' | 'empty-scope' }

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
  // Grounded (Focused) results ride the assistant message.
  card?: FreeCard
  sources?: SourceNote[]
}

const chipStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: '999px',
  padding: '0.15rem 0.55rem',
  fontSize: '0.72rem',
  color: 'var(--text-3)',
}

export function FreeChat({
  config,
  notes,
  onOpenNote,
  onReindexAll,
}: {
  config: AiConfig
  notes: Note[]
  /** Open a note (source chips, analysis sources) in the peek modal. */
  onOpenNote: (noteId: string) => void
  /** Re-embed all notes — offered by a quiz card when the index is empty. */
  onReindexAll: (notes: Note[]) => Promise<void>
}) {
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

  // Adaptive Rules — session-scoped selection, round-tripped through the conversation.
  const [ruleIds, setRuleIds] = useViewState<string[]>('ai.free.ruleIds', [])
  const vaultId = getActiveVaultId()

  // Focused (grounded) mode — arm an Analyze/Ask/Quiz action over a note scope.
  const [focus, setFocus] = useViewState<FocusState>('ai.free.focus', emptyFocus)
  const [quizSettings] = useQuizSettings()

  // Collapse the docked Focused-scope rail panel when the chat unmounts.
  useEffect(() => () => closeFocusPanel(), [])

  // Check if history sidebar is collapsed to widen the chat.
  const [collapsed] = useViewState('ai.history.collapsed', false)

  // Projects — the active project grounds the chat with its instructions + knowledge.
  const { projects } = useProjects()
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

  // Breadcrumb state
  const [, setAiMode] = useViewState('ai.mode', 'chat')
  const [, setForceOpenProject] = useViewState('ai.projects.openId', '')
  const [chatTitle, setChatTitle] = useState('New chat')
  const [isRenamingChat, setIsRenamingChat] = useState(false)
  const [chatTitleInput, setChatTitleInput] = useState('')
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false)
  const [showProjectSubmenu, setShowProjectSubmenu] = useState(false)
  const [starredChats, setStarredChats] = useViewState<Record<string, boolean>>('ai.chat.starred', {})
  const [unreadChats, setUnreadChats] = useViewState<Record<string, boolean>>('ai.chat.unread', {})

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
    setRuleIds([])
    setProjectId('') // a fresh chat is project-less; project chats open from the project
  }, [setMessages, setError, setInput, setAttachments, setRuleIds, setProjectId])

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
      setRuleIds(c.ruleIds ?? [])
      setProjectId(c.projectId || '') // projectId always mirrors the active conversation
    },
    [setMessages, setError, setInput, setAttachments, setRuleIds, setProjectId],
  )

  // Debounced quiz-answer persistence needs to flush before the active id
  // switches (same ordering cycle AiChat solved) — break it with a ref.
  const persistTimer = useRef<number | null>(null)
  const persistNowRef = useRef<() => void>(() => {})
  const flushPersist = useCallback(() => {
    if (persistTimer.current === null) return
    window.clearTimeout(persistTimer.current)
    persistTimer.current = null
    persistNowRef.current()
  }, [])

  const { persist, setActiveId, activeId } = useChatHistory('chat', loadConv, resetChat, flushPersist)

  const persistNow = useCallback(() => {
    const m = getViewState<FreeMessage[]>('ai.free.messages') ?? []
    void persist(
      m,
      null,
      titleFrom(m),
      getViewState<string>('ai.free.projectId') || null,
      getViewState<string[]>('ai.free.ruleIds') ?? [],
    )
  }, [persist])
  persistNowRef.current = persistNow

  // Debounced persist for quiz answer edits (per-keystroke IPC would be one
  // round-trip per character); a scoring event persists immediately instead.
  const persistSoon = useCallback(() => {
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null
      persistNow()
    }, 800)
  }, [persistNow])

  // Flush a pending edit on unmount so closing the view within 800ms doesn't drop it.
  useEffect(() => () => flushPersist(), [flushPersist])

  useEffect(() => {
    getConversation(activeId)
      .then(c => setChatTitle(c.title || 'Untitled'))
      .catch(() => setChatTitle(titleFrom(messages)))
  }, [activeId, messages])

  const commitChatRename = async () => {
    const title = chatTitleInput.trim()
    setIsRenamingChat(false)
    if (!title || title === chatTitle) return
    await renameConversation(activeId, title, Date.now()).catch(e => console.error(e))
    setChatTitle(title)
    eventBus.emit('ai:conversationSaved', { mode: 'chat' })
  }

  const handleDeleteChat = async () => {
    await deleteConversation(activeId).catch(e => console.error(e))
    setIsChatMenuOpen(false)
    resetChat()
    eventBus.emit('ai:conversationDeleted', { mode: 'chat' })
    eventBus.emit('ai:newChat', { mode: 'chat' })
  }

  const handleChangeProject = async (newProjectId: string | null) => {
    try {
      const c = await getConversation(activeId)
      c.projectId = newProjectId
      c.updatedAt = Date.now()
      await saveConversation(c)
      setProjectId(newProjectId || '')
      setIsChatMenuOpen(false)
      setShowProjectSubmenu(false)
      eventBus.emit('ai:conversationSaved', { mode: 'chat' })
    } catch (e) {
      console.error(e)
    }
  }

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

  // ── Focused (grounded) send: route to analyze / askNotes / generateQuiz and
  //    render the result as an assistant card in the same thread. ──
  const runFocused = async (text: string) => {
    const action = focus.action
    if (!action) return
    const scope = buildScope(focus)
    if (!scope) {
      setError(scopeHint(focus.scopeKind))
      return
    }
    const question = text.trim()
    if (action === 'ask' && !question) {
      setError('Type a question to ask about this scope.')
      return
    }

    setError(null)
    setBusy(true)
    setInput('')
    setAttachments([])

    // Capture prior turns for Ask history BEFORE appending this turn.
    const priorMsgs = getViewState<FreeMessage[]>('ai.free.messages') ?? []
    const label = scopeLabel(focus)
    const reqText = action === 'ask' ? question : `${ACTION_VERB[action]} — ${label}`
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: reqText, displayText: reqText },
      { role: 'assistant', content: '', pending: true },
    ])

    const patchLast = (patch: Partial<FreeMessage>) =>
      setMessages((p) => {
        const next = p.slice()
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') next[next.length - 1] = { ...last, ...patch }
        return next
      })

    try {
      if (action === 'analyze') {
        const result = await analyze(scope, config, notes)
        patchLast({ card: { type: 'analysis', result }, pending: false })
      } else if (action === 'quiz') {
        const { questions, reason } = await generateQuiz(scope, config, notes, quizSettings, vaultId)
        patchLast({ card: { type: 'quiz', attempt: emptyAttempt(questions, label), reason }, pending: false })
      } else {
        const res = await askNotes(scope, question, toAskHistory(priorMsgs), config, notes)
        patchLast({ content: res.answer, sources: res.sourceNotes, pending: false })
      }
      persistNow()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Focused request failed.')
      patchLast({ pending: false })
    } finally {
      setBusy(false)
    }
  }

  const send = async (opts?: { text?: string; atts?: ChatAttachment[] }) => {
    if (busy) return
    // `opts.text` is set by edit-&-retry; otherwise use the composer.
    const explicit = typeof opts?.text === 'string'
    const text = (explicit ? (opts!.text as string) : input).trim()
    const atts = opts?.atts ?? (explicit ? [] : attachments)
    // Grounded mode routes to the focused pipeline (edit-&-retry stays plain chat).
    if (focus.action && !explicit) {
      await runFocused(text)
      return
    }
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

    // Adaptive Rules: resolve once per send (session ∪ project rules, deduped),
    // filtered/selected per the Advanced settings. A rule-load failure must never
    // break chat — it degrades to no rules, not an error. Hoisted above the
    // agent/chat branch split (but after buildUserTurn's early-return) so both
    // reuse the same selection + refresh decision instead of recomputing it
    // twice, and a bad attachment/parse never burns an embedding/judge call or
    // corrupts the drift anchor for a turn that was never sent.
    const cfg = getAdvancedAiSettings()
    const sessionRuleIds = getViewState<string[]>('ai.free.ruleIds') ?? []
    const activeProjectId = getViewState<string>('ai.free.projectId') || ''
    const query = text
    let effectiveRules: AiRule[] = []
    try {
      const allRules = await listRules(vaultId)
      const projRuleIds = activeProjectId ? await listProjectRules(activeProjectId) : []
      effectiveRules = await selectRulesForSend(resolveEffectiveRules(sessionRuleIds, projRuleIds, allRules), cfg, query, config)
    } catch {
      effectiveRules = []
    }
    const rulesBlock = buildRulesSystem(effectiveRules)

    // Refresh decision (drift/violation are async; cheap strategies are instant).
    // ponytail: lastInjectedTurn is always 0 (Phase-1/2) — every eligible turn is
    // judged against everyNTurns from turn 0 for a steady cadence; true
    // per-conversation last-injected tracking is a later refinement.
    const turnIndex = prior.filter((m) => m.role === 'user').length + 1
    const approxTokens = estimateTokens(prior.map((m) => m.content).join('\n'))
    const anchorText = getViewState<string>('ai.free.ruleAnchor') ?? ''
    const recentTurns = prior.slice(-4).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    const { refresh: refreshFired, trigger } = rulesBlock
      ? await decideRefresh({ turnIndex, approxTokens, lastInjectedTurn: 0 }, cfg, config, { latestUserText: query, anchorText, rules: effectiveRules, recentTurns })
      : { refresh: false, trigger: 'none' as const }
    if (refreshFired) setViewState('ai.free.ruleAnchor', query)

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
        const result = await runAgent(config, userTurn.content, history, notes, {
          onStep,
          rulesSystem: rulesBlock || undefined,
        })
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
        if (cfg.logMetrics && rulesBlock) {
          recordRuleEvent({
            ts: Date.now(),
            convId: activeId,
            strategy: cfg.refreshStrategy,
            selection: cfg.selection,
            ruleCount: effectiveRules.length,
            refreshFired,
            approxTokensAdded: refreshFired ? estimateTokens(rulesBlock) : 0,
            trigger,
          })
        }
        const finalMessages = getViewState<FreeMessage[]>('ai.free.messages') ?? []
        void persist(
          finalMessages,
          null,
          titleFrom(finalMessages),
          getViewState<string>('ai.free.projectId') || null,
          getViewState<string[]>('ai.free.ruleIds') ?? [],
        )
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
    if (rulesBlock) systemParts.push(rulesBlock)
    const system: ChatTurn[] = systemParts.length ? [{ role: 'system', content: systemParts.join('\n\n') }] : []

    const tail: ChatTurn[] = refreshFired ? [{ role: 'system', content: rulesBlock }] : []
    const turns: ChatTurn[] = [...system, ...prior, ...tail, userTurn]

    if (cfg.logMetrics && rulesBlock) {
      recordRuleEvent({
        ts: Date.now(),
        convId: activeId,
        strategy: cfg.refreshStrategy,
        selection: cfg.selection,
        ruleCount: effectiveRules.length,
        refreshFired,
        approxTokensAdded: refreshFired ? estimateTokens(rulesBlock) : 0,
        trigger,
      })
    }

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
      void persist(
        finalMessages,
        null,
        titleFrom(finalMessages),
        getViewState<string>('ai.free.projectId') || null,
        getViewState<string[]>('ai.free.ruleIds') ?? [],
      )
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

  const activeProject = projects.find((p) => p.id === projectId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header: breadcrumb + model */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', paddingBottom: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
          {activeProject ? (
            <>
              <button 
                onClick={() => {
                  setForceOpenProject(activeProject.id)
                  setAiMode('projects')
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 0, fontWeight: 500 }}
              >
                {activeProject.name}
              </button>
              <span style={{ color: 'var(--text-3)' }}>/</span>
            </>
          ) : null}
          
          {isRenamingChat ? (
            <input
              autoFocus
              value={chatTitleInput}
              onChange={e => setChatTitleInput(e.target.value)}
              onBlur={commitChatRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitChatRename()
                if (e.key === 'Escape') setIsRenamingChat(false)
              }}
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-1)',
                fontSize: '0.9rem',
                padding: '0.1rem 0.3rem',
                width: '180px'
              }}
            />
          ) : (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setIsChatMenuOpen(!isChatMenuOpen)}
                style={{
                  background: isChatMenuOpen ? 'var(--surface-2)' : 'none',
                  border: 'none',
                  color: 'var(--text-1)',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 500,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => !isChatMenuOpen && (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => !isChatMenuOpen && (e.currentTarget.style.background = 'none')}
              >
                {chatTitle} <ChevronDown size={14} color="var(--text-3)" />
              </button>

              {isChatMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => { setIsChatMenuOpen(false); setShowProjectSubmenu(false) }} />
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      zIndex: 50,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '4px',
                      minWidth: '220px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      boxShadow: '0 10px 38px -10px rgba(0,0,0,0.5)',
                    }}
                  >
                    <MenuItem onClick={() => { setStarredChats(p => ({ ...p, [activeId]: !p[activeId] })); setIsChatMenuOpen(false) }}>
                      <Star size={14} fill={starredChats[activeId] ? 'var(--text-1)' : 'none'} /> {starredChats[activeId] ? 'Unstar' : 'Star'}
                    </MenuItem>
                    <MenuItem onClick={() => { setUnreadChats(p => ({ ...p, [activeId]: !p[activeId] })); setIsChatMenuOpen(false) }}>
                      <EyeOff size={14} /> {unreadChats[activeId] ? 'Mark as read' : 'Mark as unread'}
                    </MenuItem>
                    <MenuItem onClick={() => { setIsChatMenuOpen(false); setChatTitleInput(chatTitle); setIsRenamingChat(true) }}>
                      <Pencil size={14} /> Rename
                    </MenuItem>
                    
                    <div style={{ position: 'relative' }} onMouseEnter={() => setShowProjectSubmenu(true)} onMouseLeave={() => setShowProjectSubmenu(false)}>
                      <MenuItem onClick={() => {}}>
                        <FolderInput size={14} /> Change project <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>▶</span>
                      </MenuItem>
                      {showProjectSubmenu && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: '100%',
                            marginLeft: '4px',
                            zIndex: 51,
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            padding: '4px',
                            minWidth: '180px',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            boxShadow: '0 10px 38px -10px rgba(0,0,0,0.5)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                          }}
                        >
                          {projects.length === 0 ? (
                            <div style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-3)' }}>No projects</div>
                          ) : (
                            projects.map(p => (
                              <MenuItem key={p.id} onClick={() => handleChangeProject(p.id)}>
                                {p.name}
                              </MenuItem>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    
                    {activeProject && (
                      <MenuItem onClick={() => handleChangeProject(null)}>
                        <FolderMinus size={14} /> Remove from project
                      </MenuItem>
                    )}
                    
                    <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
                    <MenuItem danger onClick={handleDeleteChat}>
                      <Trash size={14} /> Delete
                    </MenuItem>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <span className={styles.scopeLabel}>
          {config.chatProvider} · {config.chatModel || 'no model set'}
        </span>
      </div>

      {/* Scrollable message area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: collapsed ? '920px' : '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingBottom: '0.5rem', transition: 'max-width 0.3s ease' }}>
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
                          lineHeight: 1,
                          padding: '2px 4px',
                          display: 'inline-flex',
                        }}
                      >
                        <RotateCcw size={15} />
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
                  {m.card?.type === 'analysis' ? (
                    <AnalysisCard result={m.card.result} onOpenNote={onOpenNote} />
                  ) : m.card?.type === 'quiz' ? (
                    <QuizRunner
                      attempt={m.card.attempt}
                      settings={quizSettings}
                      config={config}
                      reason={m.card.reason}
                      onChange={(next) => {
                        // A scoring event changes total/max — persist immediately;
                        // a plain answer edit only touches responses — debounce.
                        const cur = m.card && m.card.type === 'quiz' ? m.card.attempt : null
                        const scored = !cur || next.total !== cur.total || next.max !== cur.max
                        setMessages((prev) =>
                          prev.map((msg, j) =>
                            j === i && msg.card?.type === 'quiz' ? { ...msg, card: { ...msg.card, attempt: next } } : msg,
                          ),
                        )
                        if (scored) persistNow()
                        else persistSoon()
                      }}
                      onSave={async (finished) => {
                        try {
                          await create(`Quiz — ${finished.scopeLabel || 'Untitled'}`, serializeAttempt(finished), undefined, [], QUIZ_NOTE_KIND)
                          toast.success('Quiz saved as a note.')
                        } catch (err) {
                          log.error('Failed to save quiz note', err)
                          toast.error('Could not save the quiz. Try again.')
                        }
                      }}
                      onIndexNow={() => void onReindexAll(notes)}
                    />
                  ) : (
                    <div className={styles.chatA}>
                      {m.content ? (
                        <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                      ) : (
                        <span className={styles.spinner}>{m.pending ? (m.steps?.length ? 'Working…' : 'Thinking…') : ''}</span>
                      )}
                    </div>
                  )}
                  {m.sources && m.sources.length > 0 && (
                    <div className={styles.sources}>
                      {m.sources.map((s) => (
                        <button key={s.noteId} className={styles.sourceChip} onClick={() => onOpenNote(s.noteId)}>
                          {s.title}
                        </button>
                      ))}
                    </div>
                  )}
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
        <p className={styles.error} style={{ maxWidth: collapsed ? '920px' : '760px', margin: '0.25rem auto 0', width: '100%', transition: 'max-width 0.3s ease' }}>
          {error}
        </p>
      )}

      {/* Composer pinned to the bottom */}
      <div style={{ paddingTop: '0.75rem', marginTop: '0.5rem' }}>
        <div style={{ maxWidth: collapsed ? '920px' : '760px', margin: '0 auto', transition: 'max-width 0.3s ease' }}>
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
            stylePresets={stylePresets}
            skillPresets={skillPresets}
            styleId={styleId}
            onStyleId={setStyleId}
            skillIds={skillIds}
            onSkillIds={setSkillIds}
            onPresetsChanged={refreshPresets}
            vaultId={vaultId}
            ruleIds={ruleIds}
            onRuleIds={setRuleIds}
            focus={focus}
            onFocus={setFocus}
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
              <MenuItem onClick={() => startEdit(msgMenu.index)}><Pencil size={14} /> Edit &amp; retry</MenuItem>
            )}
            <MenuItem onClick={() => forkFrom(msgMenu.index)}><GitFork size={14} /> Fork from here</MenuItem>
            <MenuItem onClick={() => deleteFrom(msgMenu.index)}><ListX size={14} /> Delete from here</MenuItem>
            <MenuItem danger onClick={() => deleteMessage(msgMenu.index)}><Trash2 size={14} /> Delete message</MenuItem>
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
