// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure projections of a quiz note's content (a serialized QuizAttempt) into the
// plain-text + markdown forms the note-type infra wants for search and export.
// Mirrors plugins/canvas/canvasNote.ts.

import type { QuizAttempt, QuizOrigin, QuizQuestion, QuizScoring, QuizSourceRef, RecheckRecord } from '../../types'
import { emptyAttempt } from '../../core/ai/quizGrade'

export const EMPTY_QUIZ_CONTENT = JSON.stringify(emptyAttempt([], ''))

export function serializeAttempt(attempt: QuizAttempt): string {
  return JSON.stringify(attempt)
}

/** The stored scoring, or undefined when it's missing or malformed (a bad
 *  fraction would turn every mark into NaN). Undefined = use current settings. */
function parseScoring(value: unknown): QuizScoring | undefined {
  if (!value || typeof value !== 'object') return undefined
  const s = value as Record<string, unknown>
  if (typeof s.negativeMarking !== 'boolean') return undefined
  if (typeof s.negativeFraction !== 'number' || !Number.isFinite(s.negativeFraction)) return undefined
  if (s.mcmaRule !== 'allOrNothing' && s.mcmaRule !== 'partial' && s.mcmaRule !== 'proportional') return undefined
  if (s.feedback !== 'immediate' && s.feedback !== 'end') return undefined
  return {
    negativeMarking: s.negativeMarking,
    negativeFraction: s.negativeFraction,
    mcmaRule: s.mcmaRule,
    feedback: s.feedback,
  }
}

const isHttp = (u: unknown): u is string => {
  try {
    const p = new URL(u as string).protocol
    return p === 'http:' || p === 'https:'
  } catch {
    return false
  }
}
const str = (v: unknown): v is string => typeof v === 'string'
const count = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined

function parseRef(v: unknown): QuizSourceRef | undefined {
  const r = v as Record<string, unknown> | null
  if (!r || typeof r !== 'object' || !isHttp(r.url) || !str(r.title) || !str(r.quote)) return undefined
  return { url: r.url, title: r.title, quote: r.quote }
}

function parseRecheck(v: unknown): RecheckRecord | null {
  const r = v as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return null
  if (r.outcome !== 'confirmed' && r.outcome !== 'unclear' && r.outcome !== 'corrected') return null
  const evidence = parseRef(r.evidence)
  return {
    outcome: r.outcome,
    ...(evidence ? { evidence } : {}),
    ...(str(r.reason) ? { reason: r.reason } : {}),
  }
}

/** Keep a question's `source` only when its URL is http(s) and fields are strings. */
function cleanQuestion(q: QuizQuestion): QuizQuestion {
  if (q.source === undefined) return q
  const { source: _drop, ...rest } = q
  const source = parseRef(q.source)
  return source ? { ...rest, source } : rest
}

/** Parse note content into an attempt, or null when it isn't one. */
export function parseAttempt(content: string): QuizAttempt | null {
  try {
    const parsed = JSON.parse(content) as Partial<QuizAttempt>
    if (!parsed || !Array.isArray(parsed.questions)) return null
    const n = parsed.questions.length
    // Normalize arrays to exactly n entries, padding with same defaults emptyAttempt uses.
    const responses = (parsed.responses ?? parsed.questions.map(() => [])).slice(0, n)
    while (responses.length < n) {
      const q = parsed.questions[responses.length]
      responses.push(q.format === 'descriptive' ? '' : [])
    }
    const marks = (parsed.marks ?? parsed.questions.map(() => null)).slice(0, n)
    while (marks.length < n) marks.push(null)
    const feedback = (parsed.feedback ?? parsed.questions.map(() => '')).slice(0, n)
    while (feedback.length < n) feedback.push('')
    const scoring = parseScoring(parsed.scoring)
    const origin: QuizOrigin | undefined =
      parsed.origin === 'notes' || parsed.origin === 'web' || parsed.origin === 'ai' ? parsed.origin : undefined
    const sources = Array.isArray(parsed.sources)
      ? parsed.sources.filter((s) => s && isHttp(s.url) && str(s.title)).map((s) => ({ url: s.url, title: s.title }))
      : undefined
    const verified =
      parsed.verified === 'yes' || parsed.verified === 'failed' || parsed.verified === 'off' ? parsed.verified : undefined
    const dropped = count(parsed.dropped)
    const failedPages = count(parsed.failedPages)
    const disputed = Array.isArray(parsed.disputed)
      ? Array.from({ length: n }, (_, i) => parsed.disputed![i] === true)
      : undefined
    const rechecks = Array.isArray(parsed.rechecks)
      ? Array.from({ length: n }, (_, i) => parseRecheck(parsed.rechecks![i]))
      : undefined
    return {
      ...(scoring ? { scoring } : {}),
      ...(origin ? { origin } : {}),
      ...(sources ? { sources } : {}),
      ...(verified ? { verified } : {}),
      ...(dropped !== undefined ? { dropped } : {}),
      ...(failedPages !== undefined ? { failedPages } : {}),
      ...(disputed ? { disputed } : {}),
      ...(rechecks ? { rechecks } : {}),
      questions: parsed.questions.map(cleanQuestion),
      responses,
      marks,
      feedback,
      total: parsed.total ?? 0,
      max: parsed.max ?? 0,
      scopeLabel: parsed.scopeLabel ?? '',
      takenAt: parsed.takenAt ?? 0,
    }
  } catch {
    return null
  }
}

/** A quiz built from the web or AI knowledge — never "your notes". */
export function isOpenQuizContent(content: string): boolean {
  const origin = parseAttempt(content)?.origin
  return origin === 'web' || origin === 'ai'
}

/** Plain-text projection for search/RAG/preview — never raw JSON. */
export function quizToSearchText(content: string): string {
  const attempt = parseAttempt(content)
  if (!attempt) return ''
  return attempt.questions
    .map((q) => [q.question, ...(q.options ?? []), q.answer, q.explanation].filter(Boolean).join('\n'))
    .join('\n\n')
    .trim()
}

/** Readable markdown for export. */
export function quizToExportMarkdown(content: string): string {
  const attempt = parseAttempt(content)
  if (!attempt || attempt.questions.length === 0) return '_Empty quiz._'

  const head = [
    `# Quiz — ${attempt.scopeLabel || 'Untitled scope'}`,
    '',
    `**Score:** ${attempt.total} / ${attempt.max}`,
    '',
  ]

  const body = attempt.questions.flatMap((q, i) => {
    const lines = [`${i + 1}. ${q.question} _(${q.marks} marks)_`, '']
    if (q.options) {
      const correct = new Set(q.correct ?? [])
      lines.push(...q.options.map((opt, oi) => `- [${correct.has(oi) ? 'x' : ' '}] ${opt}`), '')
    }
    lines.push(`**Answer:** ${q.answer}`)
    if (q.explanation) lines.push(`**Why:** ${q.explanation}`)
    const mark = attempt.marks[i]
    lines.push(`**Marks awarded:** ${mark === null ? 'ungraded' : `${mark} / ${q.marks}`}`)
    if (attempt.feedback[i]) lines.push(`**Feedback:** ${attempt.feedback[i]}`)
    lines.push('')
    return lines
  })

  return [...head, ...body].join('\n').trim()
}
