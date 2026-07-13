// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure Pomodoro state machine — no timers/IO, so it's exhaustively testable. The
// store drives it once per second; the widget renders it.

export type Phase = 'work' | 'break'

export interface PomodoroState {
  phase: Phase
  /** Seconds left in the current phase. */
  remaining: number
  running: boolean
  /** Completed work sessions (🍅). */
  completed: number
}

export const WORK_SECONDS = 25 * 60
export const BREAK_SECONDS = 5 * 60

export function initialState(work = WORK_SECONDS): PomodoroState {
  return { phase: 'work', remaining: work, running: false, completed: 0 }
}

/** Advance one second. At zero, switch phase (crediting a 🍅 when work finishes). */
export function tick(s: PomodoroState, work = WORK_SECONDS, brk = BREAK_SECONDS): PomodoroState {
  if (!s.running) return s
  if (s.remaining > 1) return { ...s, remaining: s.remaining - 1 }

  const finishingWork = s.phase === 'work'
  const nextPhase: Phase = finishingWork ? 'break' : 'work'
  return {
    phase: nextPhase,
    remaining: nextPhase === 'work' ? work : brk,
    running: true,
    completed: s.completed + (finishingWork ? 1 : 0),
  }
}

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
