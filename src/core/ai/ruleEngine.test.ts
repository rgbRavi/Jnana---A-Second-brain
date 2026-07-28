// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect } from 'vitest'
import { shouldRefresh, selectRules, DEFAULT_ADVANCED_AI, type AdvancedAiSettings } from './ruleEngine'
import type { AiRule } from '../../types'

const cfg = (o: Partial<AdvancedAiSettings> = {}): AdvancedAiSettings => ({ ...DEFAULT_ADVANCED_AI, ...o })
const rule = (id: string, critical = false): AiRule => ({ id, vaultId: 'v', name: id, text: id, critical, createdAt: 0 })
const state = (turnIndex: number, approxTokens = 0, lastInjectedTurn = 0) => ({ turnIndex, approxTokens, lastInjectedTurn })

describe('shouldRefresh', () => {
  it('off never refreshes', () => {
    expect(shouldRefresh(state(99, 99999, 0), cfg({ refreshStrategy: 'off' }))).toBe(false)
  })
  it('always-tail refreshes every turn', () => {
    expect(shouldRefresh(state(1, 0, 1), cfg({ refreshStrategy: 'always-tail' }))).toBe(true)
  })
  it('counters fires when N turns elapsed since last injection', () => {
    const c = cfg({ refreshStrategy: 'counters', everyNTurns: 4, tokenThreshold: 100000 })
    expect(shouldRefresh(state(4, 0, 0), c)).toBe(true)
    expect(shouldRefresh(state(3, 0, 0), c)).toBe(false)
  })
  it('counters fires when token threshold crossed', () => {
    const c = cfg({ refreshStrategy: 'counters', everyNTurns: 999, tokenThreshold: 3000 })
    expect(shouldRefresh(state(1, 3000, 0), c)).toBe(true)
    expect(shouldRefresh(state(1, 2999, 0), c)).toBe(false)
  })
  it('phase-2 strategies fall back to counters', () => {
    const c = cfg({ refreshStrategy: 'counters-drift', everyNTurns: 2, tokenThreshold: 999999 })
    expect(shouldRefresh(state(2, 0, 0), c)).toBe(true)
  })
})

describe('selectRules', () => {
  const all = [rule('a', true), rule('b'), rule('c')]
  it('all-enabled returns everything', () => {
    expect(selectRules(all, cfg({ selection: 'all-enabled' })).length).toBe(3)
  })
  it('rag-topK falls back to all in phase 1 but always keeps critical', () => {
    const out = selectRules(all, cfg({ selection: 'rag-topK', ragTopK: 1 }))
    expect(out.some((r) => r.id === 'a')).toBe(true)
  })
})
