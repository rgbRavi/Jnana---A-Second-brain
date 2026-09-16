// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect } from 'vitest'
import { resolveEffectiveRules, buildRulesSystem } from './aiRules'
import type { AiRule } from '../types'

const r = (id: string, over: Partial<AiRule> = {}): AiRule => ({
  id, vaultId: 'v', name: id, text: `do ${id}`, critical: false, createdAt: 0, ...over,
})

describe('resolveEffectiveRules', () => {
  it('unions session + project ids and dedups', () => {
    const all = [r('a'), r('b'), r('c')]
    const out = resolveEffectiveRules(['a', 'b'], ['b', 'c'], all)
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b', 'c'])
  })
  it('ignores ids with no matching rule', () => {
    expect(resolveEffectiveRules(['x'], [], [r('a')])).toEqual([])
  })
})

describe('buildRulesSystem', () => {
  it('returns empty string for no rules', () => {
    expect(buildRulesSystem([])).toBe('')
  })
  it('renders one bullet per rule text', () => {
    const s = buildRulesSystem([r('a', { text: 'be concise' }), r('b', { text: 'cite notes' })])
    expect(s).toContain('- be concise')
    expect(s).toContain('- cite notes')
  })
})
