// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A small, pure SM-2 spaced-repetition scheduler (Anki-style 4-button grading).
// No IO — the plugin's View persists the returned state to plugin_kv. Kept pure so
// it's exhaustively unit-testable (sm2.test.ts).

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export interface CardSchedule {
  /** Ease factor (EF). Clamped to >= 1.3, starts at 2.5. */
  ease: number
  /** Current inter-review interval, in days. */
  intervalDays: number
  /** Consecutive successful reviews (reset to 0 on "again"). */
  reps: number
  /** Times the card lapsed (graded "again" after graduating). */
  lapses: number
  /** When the card next becomes due (ms epoch). */
  dueAt: number
}

const DAY_MS = 86_400_000
const MIN_EASE = 1.3
const START_EASE = 2.5

/** Fresh schedule for a never-reviewed card — due immediately (it's new). */
export function newSchedule(now: number): CardSchedule {
  return { ease: START_EASE, intervalDays: 0, reps: 0, lapses: 0, dueAt: now }
}

export function isDue(s: CardSchedule, now: number): boolean {
  return s.dueAt <= now
}

function round(n: number): number {
  return Math.max(1, Math.round(n))
}

/**
 * Apply a grade to a card's schedule, returning the next state. Standard SM-2
 * with a Hard button:
 *  - again → lapse: reps 0, due now (relearn this session), ease −0.20
 *  - hard  → interval ×1.2, ease −0.15
 *  - good  → 1d, then 6d, then interval ×ease
 *  - easy  → like good but ×1.3 and ease +0.15
 */
export function schedule(prev: CardSchedule, grade: Grade, now: number): CardSchedule {
  if (grade === 'again') {
    return {
      ease: Math.max(MIN_EASE, prev.ease - 0.2),
      intervalDays: 0,
      reps: 0,
      lapses: prev.lapses + 1,
      dueAt: now,
    }
  }

  let ease = prev.ease
  let intervalDays: number

  if (grade === 'hard') {
    ease = Math.max(MIN_EASE, prev.ease - 0.15)
    intervalDays = round(Math.max(prev.intervalDays, 1) * 1.2)
  } else {
    // good | easy
    if (prev.reps === 0) intervalDays = grade === 'easy' ? 4 : 1
    else if (prev.reps === 1) intervalDays = 6
    else intervalDays = round(prev.intervalDays * prev.ease * (grade === 'easy' ? 1.3 : 1))
    if (grade === 'easy') ease = prev.ease + 0.15
  }

  return {
    ease,
    intervalDays,
    reps: prev.reps + 1,
    lapses: prev.lapses,
    dueAt: now + intervalDays * DAY_MS,
  }
}
