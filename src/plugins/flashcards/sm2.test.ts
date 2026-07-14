// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { newSchedule, schedule, isDue, type CardSchedule } from './sm2'

const DAY = 86_400_000
const NOW = 1_000_000_000_000

describe('sm2', () => {
  it('new cards are due immediately', () => {
    const s = newSchedule(NOW)
    expect(s.reps).toBe(0)
    expect(s.ease).toBe(2.5)
    expect(isDue(s, NOW)).toBe(true)
  })

  it('good graduates 1d → 6d → interval×ease', () => {
    let s = newSchedule(NOW)
    s = schedule(s, 'good', NOW)
    expect(s.intervalDays).toBe(1)
    expect(s.reps).toBe(1)
    expect(s.dueAt).toBe(NOW + 1 * DAY)

    s = schedule(s, 'good', s.dueAt)
    expect(s.intervalDays).toBe(6)
    expect(s.reps).toBe(2)

    const before = s.intervalDays
    s = schedule(s, 'good', s.dueAt)
    expect(s.intervalDays).toBe(Math.round(before * 2.5))
    expect(s.ease).toBe(2.5) // good doesn't change ease
  })

  it('again resets reps, lapses, and is due now', () => {
    let s = schedule(newSchedule(NOW), 'good', NOW) // reps 1
    s = schedule(s, 'again', NOW + 2 * DAY)
    expect(s.reps).toBe(0)
    expect(s.intervalDays).toBe(0)
    expect(s.lapses).toBe(1)
    expect(isDue(s, NOW + 2 * DAY)).toBe(true)
    expect(s.ease).toBeCloseTo(2.3)
  })

  it('easy grows faster and raises ease; hard lowers ease', () => {
    const base = newSchedule(NOW)
    const easy = schedule(base, 'easy', NOW)
    const good = schedule(base, 'good', NOW)
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays)
    expect(easy.ease).toBeCloseTo(2.65)

    const hard = schedule(schedule(base, 'good', NOW), 'hard', NOW)
    expect(hard.ease).toBeCloseTo(2.35)
  })

  it('ease never drops below 1.3', () => {
    let s: CardSchedule = { ease: 1.3, intervalDays: 10, reps: 5, lapses: 0, dueAt: NOW }
    s = schedule(s, 'again', NOW)
    expect(s.ease).toBe(1.3)
    s = schedule(s, 'hard', NOW)
    expect(s.ease).toBe(1.3)
  })
})
