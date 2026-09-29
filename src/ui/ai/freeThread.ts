// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/ui/ai/freeThread.ts
//
// The free-chat thread's message shape, plus the pure logic for keeping every
// answer a Retry produced (the ‹ n / N › switcher on a reply).

import type { AnalysisResult, QuizAttempt, SourceNote } from '../../types'
import type { AgentStep, ChatAttachment, ProposedAction } from '../../core/ai'
import type { FocusState } from '../../core/ai/focusedScope'

/** A grounded ("Focused") result rendered as an assistant card. Serializable
 *  data only (no React nodes) so it round-trips through the conversation JSON. */
export type FreeCard =
  | { type: 'analysis'; result: AnalysisResult }
  | { type: 'quiz'; attempt: QuizAttempt; reason?: 'empty-index' | 'empty-scope' }

/** A message in the free-chat thread. `content` is the model-facing text;
 *  `displayText` (user only) is the raw text shown in the bubble. */
export interface FreeMessage {
  role: 'user' | 'assistant'
  content: string
  displayText?: string
  /** On a user turn sent in Focused mode: the armed action + scope, so Retry /
   *  Edit re-run the grounded request instead of degrading to plain chat. */
  focus?: FocusState
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
  /** Every answer Retry produced for this reply. The top-level reply fields are
   *  always the shown version (so rendering and chat history need no special
   *  case); `versionIndex` says which one. While a retry is still running,
   *  `versions` holds only the earlier answers and `versionIndex` is unset. */
  versions?: ReplyVersion[]
  versionIndex?: number
}

/** The reply-specific fields of an assistant message — one retry's answer. */
export type ReplyVersion = Pick<
  FreeMessage,
  'content' | 'card' | 'sources' | 'steps' | 'proposals' | 'appliedIds' | 'skippedIds'
>

const snapshot = (m: FreeMessage): ReplyVersion => ({
  content: m.content,
  card: m.card,
  sources: m.sources,
  steps: m.steps,
  proposals: m.proposals,
  appliedIds: m.appliedIds,
  skippedIds: m.skippedIds,
})

const hasReply = (m: FreeMessage) => !!(m.content || m.card || m.steps?.length || m.proposals?.length)

/** The answers a retry of this reply must keep — every stored version, with the
 *  shown one's latest state (quiz progress, applied proposals) written back. */
export function versionsToKeep(reply: FreeMessage | undefined): ReplyVersion[] {
  if (!reply || reply.role !== 'assistant' || !hasReply(reply)) return []
  const all = reply.versions?.length ? reply.versions.slice() : [snapshot(reply)]
  all[reply.versionIndex ?? all.length - 1] = snapshot(reply)
  return all
}

/** Settle a finished retry: the new answer joins the earlier ones and is shown.
 *  An empty one (failed or stopped before any text) gives way to the last kept answer. */
export function settleVersions(m: FreeMessage): FreeMessage {
  if (m.role !== 'assistant' || !m.versions?.length || m.versionIndex !== undefined) return m
  if (!hasReply(m)) {
    const last = m.versions.length - 1
    return { ...m, ...m.versions[last], pending: false, versionIndex: last }
  }
  const versions = [...m.versions, snapshot(m)]
  return { ...m, versions, versionIndex: versions.length - 1 }
}

/** Show another stored answer, saving the current one's state first. */
export function showVersion(m: FreeMessage, target: number): FreeMessage {
  const { versions, versionIndex } = m
  if (!versions || versionIndex === undefined || target === versionIndex) return m
  if (target < 0 || target >= versions.length) return m
  const next = versions.slice()
  next[versionIndex] = snapshot(m)
  return { ...m, ...next[target], versions: next, versionIndex: target }
}
