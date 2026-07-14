// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { initialState, tick, formatTime, type PomodoroState } from './timer'

describe('pomodoro timer', () => {
  it('starts paused in a work phase', () => {
    const s = initialState()
    expect(s.phase).toBe('work')
    expect(s.running).toBe(false)
    expect(s.completed).toBe(0)
  })

  it('a paused timer does not advance', () => {
    const s = initialState()
    expect(tick(s)).toBe(s)
  })

  it('counts down while running', () => {
    const s: PomodoroState = { phase: 'work', remaining: 10, running: true, completed: 0 }
    expect(tick(s).remaining).toBe(9)
  })

  it('work → break credits a 🍅 and resets to break length', () => {
    const s: PomodoroState = { phase: 'work', remaining: 1, running: true, completed: 2 }
    const next = tick(s, 25 * 60, 5 * 60)
    expect(next.phase).toBe('break')
    expect(next.remaining).toBe(5 * 60)
    expect(next.completed).toBe(3)
    expect(next.running).toBe(true)
  })

  it('break → work does not credit a 🍅', () => {
    const s: PomodoroState = { phase: 'break', remaining: 1, running: true, completed: 3 }
    const next = tick(s, 25 * 60, 5 * 60)
    expect(next.phase).toBe('work')
    expect(next.remaining).toBe(25 * 60)
    expect(next.completed).toBe(3)
  })

  it('formats mm:ss', () => {
    expect(formatTime(90)).toBe('1:30')
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(1500)).toBe('25:00')
  })
})
