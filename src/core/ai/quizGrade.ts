// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/ai/quizGrade.ts
//
// Scoring. Objective questions are graded here, deterministically and offline;
// only descriptive answers cost a model call (added in the next task). Kept
// pure and IO-free so the marking rules are unit-testable, in the same spirit
// as views/notes/filterNotes.ts.

import type { AiConfig, QuizAttempt, QuizQuestion, QuizSettings } from '../../types'
import { extractJsonArray } from './jsonish'
import { getChatProvider } from './provider'

/**
 * Marks for one answered objective question. Never called for descriptive
 * questions (they return 0 here). An unanswered question always scores 0 —
 * negative marking punishes a wrong answer, not a skipped one.
 */
export function scoreObjective(
  q: QuizQuestion,
  picked: number[],
  settings: QuizSettings,
): number {
  if (q.format === 'descriptive') return 0
  if (picked.length === 0) return 0

  const correct = q.correct ?? []
  if (correct.length === 0) return 0

  const penalty = settings.negativeMarking ? settings.negativeFraction * q.marks : 0
  const correctSet = new Set(correct)
  const hits = picked.filter((i) => correctSet.has(i)).length
  const misses = picked.length - hits

  if (q.format === 'mcq') {
    return picked.length === 1 && hits === 1 ? q.marks : penalty > 0 ? -penalty : 0
  }

  switch (settings.mcmaRule) {
    case 'allOrNothing':
      return misses === 0 && hits === correct.length ? q.marks : penalty > 0 ? -penalty : 0
    case 'proportional':
      return misses > 0 ? 0 : (hits / correct.length) * q.marks
    case 'partial':
    default:
      // Right picks earn their share; wrong picks cost the penalty. Floored at
      // zero so one bad multi-answer can't eat another question's marks.
      return Math.max(0, (hits / correct.length) * q.marks - misses * penalty)
  }
}

/** A blank attempt for freshly generated questions. */
export function emptyAttempt(questions: QuizQuestion[], scopeLabel: string): QuizAttempt {
  return {
    questions,
    responses: questions.map((q) => (q.format === 'descriptive' ? '' : [])),
    marks: questions.map(() => null),
    feedback: questions.map(() => ''),
    total: 0,
    max: 0,
    scopeLabel,
    takenAt: Date.now(),
  }
}

/**
 * Recompute `total`/`max` from the per-question marks. Ungraded questions
 * (`marks[i] === null`) are excluded from both, so a grader failure reads as
 * "not marked" rather than "wrong". The total is reported as-is — negative
 * marking is allowed to push it below zero.
 */
export function recomputeTotals(attempt: QuizAttempt): QuizAttempt {
  let total = 0
  let max = 0
  attempt.marks.forEach((m, i) => {
    if (m === null) return
    total += m
    max += attempt.questions[i]?.marks ?? 0
  })
  // Trim float drift from repeated fraction arithmetic (0.1 + 0.2 territory).
  const round = (n: number) => Math.round(n * 100) / 100
  return { ...attempt, total: round(total), max: round(max) }
}

const GRADER_SYSTEM = `You are marking a student's answers to questions drawn from their own notes.
For each item you get the question, a reference answer, the student's answer, and the maximum
marks. Award marks from 0 to the maximum, in steps of 0.5, judging meaning rather than wording —
a correct answer phrased differently from the reference still earns full marks. Add one short
sentence of feedback saying what earned or lost the marks.

Respond with ONLY a JSON array, one entry per item, in the same order, no prose:
[{"marks":2,"feedback":"…"}]`

/** One descriptive answer awaiting a mark. */
export interface DescriptiveItem {
  question: string
  /** The generated reference answer. */
  reference: string
  /** What the user typed. */
  answer: string
  /** Maximum marks for this question. */
  marks: number
}

/** A mark for one descriptive answer. `marks: null` means the grader failed. */
export interface DescriptiveGrade {
  marks: number | null
  feedback: string
}

/**
 * Tolerantly read the grader's reply. `caps` sets both the expected length and
 * each question's maximum. Anything unreadable becomes an ungraded entry rather
 * than a zero — an infrastructure failure must never look like a wrong answer.
 */
export function parseGrades(raw: string, caps: number[]): DescriptiveGrade[] {
  const ungraded: DescriptiveGrade = { marks: null, feedback: '' }
  let arr: unknown
  try {
    arr = JSON.parse(extractJsonArray(raw))
  } catch {
    return caps.map(() => ({ ...ungraded }))
  }
  if (!Array.isArray(arr)) return caps.map(() => ({ ...ungraded }))

  return caps.map((cap, i) => {
    const item = arr[i] as Record<string, unknown> | undefined
    if (!item || typeof item !== 'object') return { ...ungraded }
    const feedback = typeof item.feedback === 'string' ? item.feedback : ''
    const n = typeof item.marks === 'number' ? item.marks : Number(item.marks)
    if (!Number.isFinite(n)) return { marks: null, feedback }
    const clamped = Math.min(cap, Math.max(0, n))
    return { marks: Math.round(clamped * 2) / 2, feedback }
  })
}

/**
 * Mark descriptive answers with the chat model. One call for the whole batch —
 * pass a single-item array for immediate-feedback mode. Never throws: a provider
 * error comes back as ungraded entries.
 */
export async function gradeDescriptive(
  items: DescriptiveItem[],
  config: AiConfig,
): Promise<DescriptiveGrade[]> {
  const caps = items.map((it) => it.marks)
  if (items.length === 0) return []

  const body = items
    .map(
      (it, i) =>
        `Item ${i + 1} (max ${it.marks} marks)\nQuestion: ${it.question}\nReference answer: ${it.reference}\nStudent answer: ${it.answer.trim() || '(left blank)'}`,
    )
    .join('\n\n')

  try {
    const provider = getChatProvider(config)
    const raw = await provider.complete(body, { system: GRADER_SYSTEM, temperature: 0 })
    return parseGrades(raw, caps)
  } catch {
    return caps.map(() => ({ marks: null, feedback: '' }))
  }
}
