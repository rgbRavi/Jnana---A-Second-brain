// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure projections of a quiz note's content (a serialized QuizAttempt) into the
// plain-text + markdown forms the note-type infra wants for search and export.
// Mirrors plugins/canvas/canvasNote.ts.

import type { QuizAttempt } from '../../types'
import { emptyAttempt } from '../../core/ai/quizGrade'

export const EMPTY_QUIZ_CONTENT = JSON.stringify(emptyAttempt([], ''))

export function serializeAttempt(attempt: QuizAttempt): string {
  return JSON.stringify(attempt)
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
    return {
      questions: parsed.questions,
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
