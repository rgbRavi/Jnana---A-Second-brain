// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect } from 'vitest'
import { judgeDue, parseViolation } from './ruleJudge'

describe('judgeDue', () => {
  it('fires on every Nth turn only', () => {
    expect(judgeDue(3, 3)).toBe(true)
    expect(judgeDue(6, 3)).toBe(true)
    expect(judgeDue(4, 3)).toBe(false)
  })
  it('never fires for N<=0 (disabled)', () => {
    expect(judgeDue(5, 0)).toBe(false)
  })
})

describe('parseViolation', () => {
  it('reads a leading yes/no verdict tolerantly', () => {
    expect(parseViolation('YES — the reply ignored "be concise".')).toBe(true)
    expect(parseViolation('no violations found')).toBe(false)
    expect(parseViolation('{"violated": true}')).toBe(true)
  })
  it('defaults to false on unparseable output (no false refresh)', () => {
    expect(parseViolation('hmm, unclear')).toBe(false)
  })
})
