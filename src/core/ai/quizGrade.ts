// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/ai/quizGrade.ts
//
// Scoring. Objective questions are graded here, deterministically and offline;
// only descriptive answers cost a model call (added in the next task). Kept
// pure and IO-free so the marking rules are unit-testable, in the same spirit
// as views/notes/filterNotes.ts.

import type { QuizAttempt, QuizQuestion, QuizSettings } from '../../types'

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
