// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Bot, ChevronLeft, ChevronRight, ChevronDown, FileSearch, GraduationCap, MoreHorizontal, RotateCcw } from 'lucide-react'
import type { AiConfig, AiRule, Note, ProjectKnowledge, StoredConversation } from '../../types'
import { DEFAULT_VAULT_ID } from '../../types'
import {
  streamChat,
  buildUserTurn,
  pickAttachments,
  attachmentFromFile,
  attachmentFromPath,
  detectVision,
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
import { settleVersions, showVersion, versionsToKeep, type FreeMessage, type ReplyVersion } from './freeThread'
import { emptyAttempt } from '../../core/ai/quizGrade'
import {
  buildScope,
  scopeLabel,
  scopeHint,
  emptyFocus,
  toInputDate,
  ACTION_VERB,
  type FocusAction,
  type FocusState,
} from '../../core/ai/focusedScope'
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
import { getActiveVaultId, useActiveVaultId } from '../../hooks/useVaults'
import { useNotesContext } from '../../context/NotesContext'
import { serializeAttempt } from '../../plugins/quiz/quizNote'
import { QUIZ_NOTE_KIND } from '../../plugins/quiz'
import { closeFocusPanel, openFocusPanel } from '../../lib/activeFocus'
import { showConfirmDialog } from '../../lib/dialog'
import { getVisionOverrides, setVisionOverride, subscribeVisionOverrides } from '../../lib/visionOverride'
import { ContextMenu, type MenuItem } from '../ContextMenu'
import { MarkdownLite } from '../editor/MarkdownLite'
import { openRailPanel } from '../rail/RightRail'
import { FOCUSED_PANEL_ID } from './FocusedMenu'
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

/** Turns fed to the model as chat history. A grounded turn with no text reply
 *  (quiz/analysis card, failed request) is dropped along with its label — an
 *  empty assistant turn or a bare "Quiz — Topic: …" only confuses the model. */
const toChatHistory = (msgs: FreeMessage[]): FreeMessage[] =>
  msgs.filter((m, i) => {
    if (m.role === 'assistant') return !!m.content
    const next = msgs[i + 1]
    return !m.focus || (next?.role === 'assistant' && !!next.content)
  })

/**
 * Requests in flight, keyed by conversation id. The reply writes here, so it
 * keeps landing after the user switches chats or leaves the AI view; the visible
 * thread (`ai.free.messages`) only mirrors an entry while its chat is active.
 * Module scope, so it outlives FreeChat unmounting.
 */
interface InflightThread {
  messages: FreeMessage[]
  vaultId: string
  projectId: string | null
  ruleIds: string[]
  controller?: AbortController
  /** The save made at send time — finishing awaits it so the existence check can't race it. */
  saved?: Promise<void>
}
const inflight = new Map<string, InflightThread>()
/** Mounted FreeChat instances — 0 means the user left the AI chat view. */
let chatMounted = 0

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

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
  notes: allNotes,
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
  // Everything note-facing here (attach picker, grounding, agent, re-index) is
  // limited to the active vault, like the rest of the app.
  const vaultId = useActiveVaultId()
  const notes = useMemo(
    () => allNotes.filter((n) => (n.vaultId ?? DEFAULT_VAULT_ID) === vaultId),
    [allNotes, vaultId],
  )
  // The "Analyze last saved note" starter's target: newest plain-markdown note in
  // this vault (typed notes — canvas, quiz — hold JSON, not prose worth analyzing).
  const lastSavedNote = useMemo(
    () =>
      notes
        .filter((n) => !n.kind)
        .reduce<Note | null>((best, n) => ((n.updatedAt ?? n.createdAt) > (best ? (best.updatedAt ?? best.createdAt) : -1) ? n : best), null),
    [notes],
  )

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
  const [chatMenu, setChatMenu] = useState<{ x: number; y: number } | null>(null)
  const composerInputRef = useRef<HTMLTextAreaElement>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  // Re-render when the user flips "Send images to this model" (caps reads the override).
  useSyncExternalStore(subscribeVisionOverrides, getVisionOverrides, getVisionOverrides)
  const caps = modelCapabilities(config.chatModel)
  const visionDetected = detectVision(config.chatModel)
  const changeVision = (on: boolean) =>
    // Store an answer only when it disagrees with the name guess.
    setVisionOverride(config.chatModel, on === visionDetected ? undefined : on)

  // History wiring: load/new come from the drawer via the eventBus.
  // Switching chats never aborts a request — it carries on in `inflight`.
  const resetChat = useCallback((opts?: { projectId?: string }) => {
    setBusy(false)
    setMessages([])
    setError(null)
    setInput('')
    setAttachments([])
    setRuleIds([])
    setProjectId(opts?.projectId ?? '') // project-less unless started from a project
  }, [setBusy, setMessages, setError, setInput, setAttachments, setRuleIds, setProjectId])

  const loadConv = useCallback(
    (c: StoredConversation) => {
      // A chat with a reply still in flight shows the live thread, not the
      // partial copy saved when it was sent.
      const live = inflight.get(c.id)
      setBusy(!!live)
      if (live) {
        setMessages(live.messages)
      } else {
        try {
          setMessages(JSON.parse(c.messages) as FreeMessage[])
        } catch {
          setMessages([])
        }
      }
      setError(null)
      setInput('')
      setAttachments([])
      setRuleIds(c.ruleIds ?? [])
      setProjectId(c.projectId || '') // projectId always mirrors the active conversation
    },
    [setBusy, setMessages, setError, setInput, setAttachments, setRuleIds, setProjectId],
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

  const { persist, setActiveId, activeId, getActiveId } = useChatHistory('chat', loadConv, resetChat, flushPersist)

  useEffect(() => {
    chatMounted++
    // Re-sync after remount: a request may have finished while the view was away.
    setBusy(inflight.has(getActiveId()))
    return () => {
      chatMounted--
    }
  }, [getActiveId, setBusy])

  // ── In-flight thread plumbing (see `inflight`) ──
  /** Register a request's thread, show it, and save it right away so the chat
   *  exists in history even if the user switches before any reply arrives. */
  const beginThread = (convId: string, next: FreeMessage[], controller?: AbortController) => {
    const entry: InflightThread = {
      messages: next,
      vaultId: getActiveVaultId(),
      projectId: getViewState<string>('ai.free.projectId') || null,
      ruleIds: getViewState<string[]>('ai.free.ruleIds') ?? [],
      controller,
    }
    inflight.set(convId, entry)
    if (getActiveId() === convId) setMessages(next)
    entry.saved = persist(next, null, titleFrom(next), entry.projectId, entry.ruleIds, { id: convId, vaultId: entry.vaultId })
  }
  const patchThread = (convId: string, fn: (prev: FreeMessage[]) => FreeMessage[]) => {
    const entry = inflight.get(convId)
    if (!entry) return
    entry.messages = fn(entry.messages)
    if (getActiveId() === convId) setMessages(entry.messages)
  }
  const patchLastReply = (convId: string, patch: Partial<FreeMessage>) =>
    patchThread(convId, (p) => {
      const next = p.slice()
      const last = next[next.length - 1]
      if (last && last.role === 'assistant') next[next.length - 1] = { ...last, ...patch }
      return next
    })
  /** An error belongs to its chat: inline when it's on screen, a toast otherwise. */
  const reportError = (convId: string, message: string) => {
    if (chatMounted > 0 && getActiveId() === convId) setError(message)
    else toast.error(`AI chat “${titleFrom(inflight.get(convId)?.messages ?? [])}”: ${message}`)
  }
  /** Save the finished thread, and tell the user if they're elsewhere. */
  const finishThread = async (convId: string) => {
    const entry = inflight.get(convId)
    if (!entry) return
    patchThread(convId, (p) => {
      const last = p[p.length - 1]
      return last?.role === 'assistant' ? [...p.slice(0, -1), settleVersions(last)] : p
    })
    inflight.delete(convId)
    const onScreen = chatMounted > 0 && getActiveId() === convId
    if (getActiveId() === convId) setBusy(false)
    await entry.saved
    // Deleted while the reply was running? Don't resurrect it.
    const exists = await getConversation(convId).then(() => true, () => false)
    if (!exists) return
    await persist(entry.messages, null, titleFrom(entry.messages), entry.projectId, entry.ruleIds, {
      id: convId,
      vaultId: entry.vaultId,
    })
    if (!onScreen) toast.success(`AI replied in “${titleFrom(entry.messages)}” — open it from Chat history.`)
  }

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
    const ok = await showConfirmDialog({
      title: 'Delete chat',
      message: `“${chatTitle}” and all its messages will be deleted. This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    inflight.get(activeId)?.controller?.abort()
    await deleteConversation(activeId).catch(e => console.error(e))
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

  const addAttachmentsFrom = async <T,>(items: T[], make: (item: T) => Promise<ChatAttachment>) => {
    try {
      const made: ChatAttachment[] = []
      for (const item of items) made.push(await make(item))
      setAttachments((prev) => [...prev, ...made])
      if (!caps.vision && made.some((a) => a.kind === 'image')) {
        toast.info(`${config.chatModel || 'This model'} isn't set to receive images — turn on Attach → "Send images to this model" if it can.`)
      }
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
  // `keepComposer`: a Retry/Edit re-run must not wipe the user's current draft.
  // `versions`: earlier answers a Retry keeps (see freeThread.ts).
  const runFocused = async (f: FocusState, text: string, keepComposer = false, versions?: ReplyVersion[]) => {
    const action = f.action
    if (!action || busy) return
    const scope = buildScope(f)
    if (!scope) {
      setError(scopeHint(f.scopeKind))
      return
    }
    const question = text.trim()
    if (action === 'ask' && !question) {
      setError('Type a question to ask about this scope.')
      return
    }

    setError(null)
    setBusy(true)
    if (!keepComposer) {
      setInput('')
      setAttachments([])
    }

    // Capture prior turns for Ask history BEFORE appending this turn.
    const convId = getActiveId()
    const priorMsgs = getViewState<FreeMessage[]>('ai.free.messages') ?? []
    const label = scopeLabel(f)
    const reqText = action === 'ask' ? question : `${ACTION_VERB[action]} — ${label}`
    beginThread(convId, [
      ...priorMsgs,
      { role: 'user', content: reqText, displayText: reqText, focus: f },
      { role: 'assistant', content: '', pending: true, versions },
    ])
    const patchLast = (patch: Partial<FreeMessage>) => patchLastReply(convId, patch)
    const grounding = { contextTokens: getAdvancedAiSettings().noteContextTokens }

    try {
      if (action === 'analyze') {
        const result = await analyze(scope, config, notes, grounding)
        patchLast({ card: { type: 'analysis', result }, pending: false })
      } else if (action === 'quiz') {
        const { questions, reason } = await generateQuiz(scope, config, notes, quizSettings, vaultId, grounding)
        console.warn('[quiz-debug] generateQuiz result', { count: questions.length, reason, scope, formats: quizSettings.formats })
        patchLast({ card: { type: 'quiz', attempt: emptyAttempt(questions, label), reason }, pending: false })
      } else {
        const res = await askNotes(scope, question, toAskHistory(priorMsgs), config, notes, grounding)
        patchLast({ content: res.answer, sources: res.sourceNotes, pending: false })
      }
    } catch (e) {
      reportError(convId, e instanceof Error ? e.message : 'Focused request failed.')
      // Drop the empty reply; the request stays in the thread with its Retry button.
      // A retry keeps its reply so finishThread can restore the previous answer.
      patchThread(convId, (p) => {
        const last = p[p.length - 1]
        if (!last || last.role !== 'assistant' || !last.pending) return p
        return last.versions?.length ? [...p.slice(0, -1), { ...last, pending: false }] : p.slice(0, -1)
      })
    } finally {
      await finishThread(convId)
    }
  }

  const send = async (opts?: { text?: string; atts?: ChatAttachment[]; versions?: ReplyVersion[] }) => {
    if (busy) return
    // `opts.text` is set by edit-&-retry; otherwise use the composer.
    const explicit = typeof opts?.text === 'string'
    const text = (explicit ? (opts!.text as string) : input).trim()
    const atts = opts?.atts ?? (explicit ? [] : attachments)
    // Grounded mode routes to the focused pipeline. Edit/Retry pass `text` and
    // never land here for a Focused turn — they re-run it via its stored `focus`.
    // Read the armed state from the store, not the closure — the rail panel can
    // arm it out-of-tree, so the freshest value is authoritative (same reason the
    // rest of send() reads messages/projectId/ruleIds via getViewState).
    const focusNow = getViewState<FocusState>('ai.free.focus') ?? focus
    const goesFocused = !!focusNow.action && !explicit
    console.warn(`[quiz-debug] send -> ${goesFocused ? 'FOCUSED:' + focusNow.action : 'CHAT'} (storeAction=${focusNow.action}, closureAction=${focus.action}, textLen=${text.length})`)
    if (goesFocused) {
      await runFocused(focusNow, text)
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
    // The request belongs to the chat it was sent from, even if the user switches
    // chats while attachments/rules below are still resolving.
    const convId = getActiveId()
    const baseMsgs = getViewState<FreeMessage[]>('ai.free.messages') ?? []
    const prior: ChatTurn[] = toChatHistory(baseMsgs).map((m) => ({
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

    const controller = new AbortController()
    beginThread(
      convId,
      [
        ...baseMsgs,
        { role: 'user', content: userTurn.content, displayText: text, attachments: atts },
        { role: 'assistant', content: '', pending: true, versions: opts?.versions },
      ],
      controller,
    )
    if (warnings.length) reportError(convId, warnings.join('  '))

    // ── Agent mode: tool-loop over the vault (writes staged as proposals) ──
    if (agent) {
      const history: AgentMessage[] = prior.map((m) => ({ role: m.role, content: m.content }))
      const onStep = (s: AgentStep) =>
        patchThread(convId, (p) => {
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
        patchLastReply(convId, { content: result.answer, steps: result.steps, proposals: result.proposals, pending: false })
      } catch (e) {
        reportError(convId, e instanceof Error ? e.message : String(e))
        patchLastReply(convId, { pending: false })
      } finally {
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
        await finishThread(convId)
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

    const onToken = (delta: string) =>
      patchThread(convId, (prev) => {
        const next = prev.slice()
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + delta }
        return next
      })

    try {
      await streamChat(config, turns, { think, signal: controller.signal, route }, onToken)
    } catch (e) {
      reportError(convId, e instanceof Error ? e.message : String(e))
    } finally {
      patchLastReply(convId, { pending: false })
      await finishThread(convId)
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
    const focusOf = messages[idx]?.focus
    setMessages((prev) => prev.slice(0, idx)) // drop the old message + everything after
    if (focusOf?.action) await runFocused(focusOf, text, true)
    else await send({ text })
  }
  /** What "Copy message" puts on the clipboard — what the user saw, not the
   *  attachment-expanded prompt. Cards (quiz/analysis) have no text. */
  const copyableText = (m?: FreeMessage) => (m ? (m.role === 'user' ? (m.displayText ?? m.content) : m.content) : '')
  const copyMessage = async (index: number) => {
    setMsgMenu(null)
    try {
      await navigator.clipboard.writeText(copyableText(messages[index]))
      toast.success('Message copied.', 2000)
    } catch (e) {
      log.error('Failed to copy message', e)
      toast.error('Could not copy the message.')
    }
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
    const versions = versionsToKeep(messages[index + 1])
    setMsgMenu(null)
    setMessages((prev) => prev.slice(0, index))
    if (m.focus?.action) await runFocused(m.focus, text, true, versions)
    else await send({ text, atts, versions })
  }
  const switchVersion = (index: number, target: number) => {
    setMessages((prev) => prev.map((m, j) => (j === index ? showVersion(m, target) : m)))
    persistNow()
  }
  // Retry sits under the newest prompt only — older ones have later turns built on them.
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user')

  /** Open the per-message menu from its visible "⋯" button (keyboard-reachable
   *  twin of the right-click menu). */
  const openMenuFrom = (e: React.MouseEvent<HTMLElement>, index: number) => {
    const r = e.currentTarget.getBoundingClientRect()
    setMsgMenu({ index, x: r.left, y: r.bottom + 4 })
  }
  const messageMenuItems = (index: number): MenuItem[] => {
    const m = messages[index]
    return [
      ...(copyableText(m) ? [{ label: 'Copy message', onClick: () => void copyMessage(index) }] : []),
      ...(m?.role === 'user' ? [{ label: 'Edit & retry', onClick: () => startEdit(index), disabled: busy }] : []),
      { label: 'Fork from here', onClick: () => forkFrom(index) },
      { label: 'Delete from here', onClick: () => deleteFrom(index), separator: true },
      { label: 'Delete message', onClick: () => deleteMessage(index), danger: true },
    ]
  }

  // ── Modes: a Focused action and Agent can't combine (a Focused send never
  //    reaches the agent loop), so arming one turns the other off and says so.
  const updateFocus = (updater: (f: FocusState) => FocusState) => {
    const prev = getViewState<FocusState>('ai.free.focus') ?? focus
    const next = updater(prev)
    setFocus(next)
    if (next.action && getViewState<boolean>('ai.free.agent')) {
      setAgent(false)
      toast.info(`Agent turned off — ${ACTION_VERB[next.action]} works from your notes directly.`)
    }
  }
  const changeAgent = (on: boolean) => {
    const f = getViewState<FocusState>('ai.free.focus') ?? focus
    if (on && f.action) {
      setFocus({ ...f, action: null })
      closeFocusPanel()
      toast.info(`${ACTION_VERB[f.action]} turned off — Agent can't run alongside a note action.`)
    }
    setAgent(on)
  }

  // ── Empty-state starters: set a mode up, never send on their own.
  const armFocused = (action: FocusAction, patch: Partial<FocusState> = {}) => {
    updateFocus((f) => ({ ...f, ...patch, action }))
    openFocusPanel()
    openRailPanel(FOCUSED_PANEL_ID)
  }
  const startWeekQuiz = () => {
    const now = Date.now()
    armFocused('quiz', {
      scopeKind: 'time',
      fromStr: toInputDate(new Date(now - 6 * 24 * 60 * 60 * 1000)),
      toStr: toInputDate(new Date(now)),
    })
  }
  const startAsk = () => {
    armFocused('ask')
    composerInputRef.current?.focus()
  }
  const startAnalyzeLast = () => {
    if (!lastSavedNote) return
    armFocused('analyze', {
      scopeKind: 'note',
      selectedNotes: [{ id: lastSavedNote.id, title: lastSavedNote.title?.trim() || 'Untitled' }],
    })
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
            <button
              type="button"
              className={styles.chatTitleBtn}
              aria-haspopup="menu"
              aria-expanded={!!chatMenu}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setChatMenu(chatMenu ? null : { x: r.left, y: r.bottom + 4 })
              }}
            >
              {chatTitle} <ChevronDown size={14} />
            </button>
          )}
        </div>

        <span className={styles.scopeLabel}>
          {config.chatProvider} · {config.chatModel || 'no model set'}
        </span>
      </div>

      {/* Scrollable message area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: collapsed ? '920px' : '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingBottom: '0.5rem', transition: 'max-width var(--dur-base) var(--motion-ease)' }}>
          {messages.length === 0 ? (
            <div className={styles.starters}>
              <p className={styles.startersLead}>Start from your notes, or just talk.</p>
              <div className={styles.starterList}>
                <button type="button" className={styles.starter} onClick={startWeekQuiz}>
                  <GraduationCap size={17} />
                  <span>
                    <strong>Quiz me on this week's notes</strong>
                    <small>Sets up a quiz over the past 7 days — review the settings, then press Quiz me.</small>
                  </span>
                </button>
                <button type="button" className={styles.starter} onClick={startAsk}>
                  <Bot size={17} />
                  <span>
                    <strong>Ask my notes…</strong>
                    <small>Answers only from the notes you pick, with sources.</small>
                  </span>
                </button>
                <button type="button" className={styles.starter} onClick={startAnalyzeLast} disabled={!lastSavedNote}>
                  <FileSearch size={17} />
                  <span>
                    <strong>Analyze last saved note</strong>
                    <small>
                      {lastSavedNote
                        ? `“${lastSavedNote.title?.trim() || 'Untitled'}” — summary, key concepts and weak spots.`
                        : 'No notes in this vault yet.'}
                    </small>
                  </span>
                </button>
              </div>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <div
                  key={i}
                  className={styles.msgRow}
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
                      <div className={styles.msgActions}>
                      <button
                        type="button"
                        className={styles.msgMoreBtn}
                        onClick={(e) => openMenuFrom(e, i)}
                        aria-haspopup="menu"
                        title="Message actions"
                        aria-label="Message actions"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                      {i === lastUserIndex && <button
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
                      </button>}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div
                  key={i}
                  className={styles.msgRow}
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
                        <MarkdownLite content={m.content} />
                      ) : (
                        <span className={styles.spinner}>{m.pending ? (m.steps?.length ? 'Working…' : 'Thinking…') : ''}</span>
                      )}
                    </div>
                  )}
                  {!m.pending && (
                  <div className={styles.msgActions}>
                  <button
                    type="button"
                    className={styles.msgMoreBtn}
                    onClick={(e) => openMenuFrom(e, i)}
                    aria-haspopup="menu"
                    title="Message actions"
                    aria-label="Message actions"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {m.versions && m.versions.length > 1 && m.versionIndex !== undefined && (
                    <div className={styles.versionSwitch} aria-label="Answer versions">
                      <button
                        onClick={() => switchVersion(i, m.versionIndex! - 1)}
                        disabled={busy || m.versionIndex === 0}
                        title="Previous answer"
                        aria-label="Previous answer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span>{m.versionIndex + 1} / {m.versions.length}</span>
                      <button
                        onClick={() => switchVersion(i, m.versionIndex! + 1)}
                        disabled={busy || m.versionIndex === m.versions.length - 1}
                        title="Next answer"
                        aria-label="Next answer"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
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
        <p className={styles.error} role="alert" style={{ maxWidth: collapsed ? '920px' : '760px', margin: '0.25rem auto 0', width: '100%', transition: 'max-width var(--dur-base) var(--motion-ease)' }}>
          {error}
        </p>
      )}

      {/* Composer pinned to the bottom */}
      <div style={{ paddingTop: '0.75rem', marginTop: '0.5rem' }}>
        <div style={{ maxWidth: collapsed ? '920px' : '760px', margin: '0 auto', transition: 'max-width var(--dur-base) var(--motion-ease)' }}>
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={() => void send()}
            onStop={() => inflight.get(getActiveId())?.controller?.abort()}
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
            onAgentChange={changeAgent}
            vision={caps.vision}
            visionDetected={visionDetected}
            onVisionChange={changeVision}
            model={config.chatModel}
            onPasteFiles={(files) => void addAttachmentsFrom(files, attachmentFromFile)}
            onDropPaths={(paths) => void addAttachmentsFrom(paths, attachmentFromPath)}
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
            onFocus={updateFocus}
            projectName={activeProject?.name}
            inputRef={composerInputRef}
          />
        </div>
      </div>

      {/* Per-message menu — right-click or the ⋯ button */}
      {msgMenu && (
        <ContextMenu x={msgMenu.x} y={msgMenu.y} items={messageMenuItems(msgMenu.index)} onClose={() => setMsgMenu(null)} />
      )}
      {chatMenu && (
        <ContextMenu
          x={chatMenu.x}
          y={chatMenu.y}
          onClose={() => setChatMenu(null)}
          items={[
            { label: 'Rename', onClick: () => { setChatTitleInput(chatTitle); setIsRenamingChat(true) } },
            {
              label: 'Move to project',
              children: projects.length
                ? projects.map((p) => ({ label: p.name, disabled: p.id === projectId, onClick: () => void handleChangeProject(p.id) }))
                : [{ label: 'No projects yet', disabled: true }],
            },
            ...(activeProject ? [{ label: 'Remove from project', onClick: () => void handleChangeProject(null) }] : []),
            { label: 'Delete chat…', danger: true, separator: true, onClick: () => void handleDeleteChat() },
          ]}
        />
      )}
    </div>
  )
}
