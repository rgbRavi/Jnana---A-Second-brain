// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect } from 'vitest'
import { cosineSim, topKByScore } from './ruleSelect'
import type { AiRule } from '../../types'

const rule = (id: string, critical = false): AiRule => ({ id, vaultId: 'v', name: id, text: id, critical, createdAt: 0 })

describe('cosineSim', () => {
  it('is 1 for identical, 0 for orthogonal', () => {
    expect(cosineSim([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0)
  })
  it('returns 0 on empty/zero vectors (no NaN)', () => {
    expect(cosineSim([], [])).toBe(0)
    expect(cosineSim([0, 0], [1, 1])).toBe(0)
  })
})

describe('topKByScore', () => {
  const rules = [rule('crit', true), rule('a'), rule('b'), rule('c')]
  const scores = [0.0, 0.9, 0.5, 0.1] // crit scores low but is critical
  it('always keeps critical rules even at k=1', () => {
    const out = topKByScore(rules, scores, 1).map((r) => r.id)
    expect(out).toContain('crit')
  })
  it('fills remaining slots by descending score', () => {
    const out = topKByScore(rules, scores, 2).map((r) => r.id)
    expect(out).toContain('crit') // critical, always
    expect(out).toContain('a')    // highest non-critical
    expect(out).not.toContain('c')
  })
})
