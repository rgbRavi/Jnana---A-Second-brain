// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect, beforeEach } from 'vitest'
import { recordRuleEvent, getRuleEvents, clearRuleEvents } from './ruleMetrics'

const ev = (convId: string) => ({
  ts: 1, convId, strategy: 'counters' as const, selection: 'all-enabled' as const,
  ruleCount: 2, refreshFired: true, approxTokensAdded: 40, trigger: 'counters' as const,
})

describe('ruleMetrics ring buffer', () => {
  beforeEach(() => clearRuleEvents())
  it('records and reads back events', () => {
    recordRuleEvent(ev('a'))
    expect(getRuleEvents().map((e) => e.convId)).toEqual(['a'])
  })
  it('caps at 200 (drops oldest)', () => {
    for (let i = 0; i < 205; i++) recordRuleEvent(ev(String(i)))
    const evs = getRuleEvents()
    expect(evs.length).toBe(200)
    expect(evs[0].convId).toBe('5')
  })
})
