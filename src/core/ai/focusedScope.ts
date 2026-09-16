// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure scope helpers for the grounded ("Focused") chat actions — extracted from
// the old AiChat.tsx so the merged FreeChat can build an AnalyzeInput from the
// composer's Focused menu. No IO, no React — unit-tested in focusedScope.test.ts.

import type { AnalyzeInput } from '../../types'

export type ScopeKind = 'topic' | 'time' | 'note'
export type FocusAction = 'analyze' | 'ask' | 'quiz'

/** The armed grounded-mode selection, persisted in FreeChat view-state. */
export interface FocusState {
  /** null = normal (ungrounded) chat. */
  action: FocusAction | null
  scopeKind: ScopeKind
  topicPhrase: string
  selectedNoteId: string | null
  selectedNoteTitle: string
  /** yyyy-mm-dd */
  fromStr: string
  toStr: string
}

const DAY = 24 * 60 * 60 * 1000

export function toInputDate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export const startOfDay = (s: string) => new Date(`${s}T00:00:00`).getTime()
export const endOfDay = (s: string) => new Date(`${s}T23:59:59.999`).getTime()

const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** A fresh, unarmed focus state (default scope = last 7 days for time mode). */
export function emptyFocus(): FocusState {
  const today = new Date()
  return {
    action: null,
    scopeKind: 'topic',
    topicPhrase: '',
    selectedNoteId: null,
    selectedNoteTitle: '',
    fromStr: toInputDate(new Date(today.getTime() - 6 * DAY)),
    toStr: toInputDate(today),
  }
}

/** Build a window AnalyzeInput from two yyyy-mm-dd strings (order-independent). */
export function buildTimeScope(fromStr: string, toStr: string): AnalyzeInput {
  const [lo, hi] = startOfDay(fromStr) <= startOfDay(toStr) ? [fromStr, toStr] : [toStr, fromStr]
  const since = startOfDay(lo)
  const until = endOfDay(hi)
  return {
    mode: 'window',
    since,
    until,
    label: lo === hi ? fmtDate(since) : `${fmtDate(since)} – ${fmtDate(until)}`,
  }
}

/** Effective AnalyzeInput from the current focus state (null if incomplete). */
export function buildScope(f: FocusState): AnalyzeInput | null {
  if (f.scopeKind === 'topic') return f.topicPhrase.trim() ? { mode: 'topic', query: f.topicPhrase.trim() } : null
  if (f.scopeKind === 'note') return f.selectedNoteId ? { mode: 'note', noteId: f.selectedNoteId } : null
  return buildTimeScope(f.fromStr, f.toStr)
}

/** A stable identity for a scope, so a thread resets only when scope changes. */
export function scopeKey(s: AnalyzeInput): string {
  if (s.mode === 'topic') return `topic:${s.query.trim().toLowerCase()}`
  if (s.mode === 'note') return `note:${s.noteId}`
  return `time:${s.since}-${s.until}`
}

/** Human label for the chip, card, and quiz attempt (e.g. "Topic: neural nets"). */
export function scopeLabel(f: FocusState): string {
  if (f.scopeKind === 'topic') return f.topicPhrase.trim() ? `Topic: ${f.topicPhrase.trim()}` : 'Topic'
  if (f.scopeKind === 'note') return f.selectedNoteTitle ? `Note: ${f.selectedNoteTitle}` : 'Selected note'
  const s = buildTimeScope(f.fromStr, f.toStr)
  return s.mode === 'window' ? s.label : 'Time range'
}

/** Missing-scope hint shown inline when a focused send has nothing to ground on. */
export function scopeHint(kind: ScopeKind): string {
  if (kind === 'topic') return 'Enter a topic to ground on (open the Focused menu).'
  if (kind === 'note') return 'Pick a note to ground on (open the Focused menu).'
  return 'No notes in that time range.'
}

export const ACTION_VERB: Record<FocusAction, string> = {
  analyze: 'Analyze',
  ask: 'Ask',
  quiz: 'Quiz',
}
