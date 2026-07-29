// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect } from 'vitest'
import { decideRefresh } from './ruleDecide'
import { DEFAULT_ADVANCED_AI, type AdvancedAiSettings } from './ruleEngine'
import type { AiConfig } from '../../types'

const cfg = (o: Partial<AdvancedAiSettings> = {}): AdvancedAiSettings => ({ ...DEFAULT_ADVANCED_AI, ...o })
const config = {} as AiConfig
const ctx = { latestUserText: 'x', anchorText: 'y', recentTurns: [], rules: [] }
const state = { turnIndex: 2, approxTokens: 0, lastInjectedTurn: 0 }
const fakes = { drift: async () => true, violation: async () => true }

describe('decideRefresh', () => {
  it('off → no refresh, no IO', async () => {
    const r = await decideRefresh(state, cfg({ refreshStrategy: 'off' }), config, ctx, fakes)
    expect(r).toEqual({ refresh: false, trigger: 'none' })
  })
  it('always-tail → refresh with trigger always', async () => {
    const r = await decideRefresh(state, cfg({ refreshStrategy: 'always-tail' }), config, ctx, fakes)
    expect(r).toEqual({ refresh: true, trigger: 'always' })
  })
  it('counters below threshold → no refresh', async () => {
    const r = await decideRefresh({ ...state, turnIndex: 1 }, cfg({ refreshStrategy: 'counters', everyNTurns: 4, tokenThreshold: 9e9 }), config, ctx, fakes)
    expect(r.refresh).toBe(false)
  })
  it('counters-drift fires via the drift signal even when counters would not', async () => {
    const r = await decideRefresh({ ...state, turnIndex: 1 }, cfg({ refreshStrategy: 'counters-drift', everyNTurns: 9, tokenThreshold: 9e9 }), config, ctx, fakes)
    expect(r).toEqual({ refresh: true, trigger: 'drift' })
  })
  it('counters-violation fires via the judge', async () => {
    const r = await decideRefresh({ ...state, turnIndex: 1 }, cfg({ refreshStrategy: 'counters-violation', everyNTurns: 9, tokenThreshold: 9e9 }), config, ctx, fakes)
    expect(r).toEqual({ refresh: true, trigger: 'violation' })
  })
})
