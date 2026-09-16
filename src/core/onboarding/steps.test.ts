// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import { COMFORTS, ROLES, selectSteps, type OnboardingComfort, type OnboardingRole } from './steps'

const allPairs: [OnboardingRole, OnboardingComfort][] = ROLES.flatMap((r) =>
  COMFORTS.map((c) => [r, c] as [OnboardingRole, OnboardingComfort]),
)

describe('selectSteps', () => {
  it('covers 15 role x comfort pairs', () => {
    expect(allPairs).toHaveLength(15)
  })

  it('always opens with welcome/role/comfort and ends with finish', () => {
    for (const [role, comfort] of allPairs) {
      const deck = selectSteps(role, comfort)
      expect(deck.slice(0, 3)).toEqual(['welcome', 'role', 'comfort'])
      expect(deck[deck.length - 1]).toBe('finish')
    }
  })

  it('never repeats a step', () => {
    for (const [role, comfort] of allPairs) {
      const deck = selectSteps(role, comfort)
      expect(new Set(deck).size).toBe(deck.length)
    }
  })

  it('is monotonic in comfort for a fixed role: new subset-of some subset-of power', () => {
    for (const role of ROLES) {
      const low = selectSteps(role, 'new')
      const mid = selectSteps(role, 'some')
      const high = selectSteps(role, 'power')
      expect(low.every((id) => mid.includes(id))).toBe(true)
      expect(mid.every((id) => high.includes(id))).toBe(true)
      expect(high.length).toBeGreaterThan(low.length)
    }
  })

  it('returns the beginner deck before either question is answered', () => {
    expect(selectSteps(null, null)).toEqual([
      'welcome',
      'role',
      'comfort',
      'capture',
      'links',
      'finish',
    ])
  })

  it('gates the study kit to students and the research kit to researchers', () => {
    expect(selectSteps('student', 'some')).toContain('study-kit')
    expect(selectSteps('student', 'some')).not.toContain('research-kit')
    expect(selectSteps('researcher', 'some')).toContain('research-kit')
    expect(selectSteps('researcher', 'some')).not.toContain('study-kit')
    expect(selectSteps('professional', 'power')).not.toContain('study-kit')
  })

  it('withholds power-only cards below power comfort', () => {
    expect(selectSteps('student', 'some')).not.toContain('power-tools')
    expect(selectSteps('student', 'power')).toContain('power-tools')
  })
})
