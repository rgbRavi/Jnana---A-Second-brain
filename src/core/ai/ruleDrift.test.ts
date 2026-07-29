// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect } from 'vitest'
import { isDrift } from './ruleDrift'

describe('isDrift', () => {
  it('topic-shift: drift when similarity to the anchor turn drops below threshold', () => {
    expect(isDrift('topic-shift', 0.4, 0.9, 0.6)).toBe(true)   // moved away from anchor
    expect(isDrift('topic-shift', 0.8, 0.1, 0.6)).toBe(false)  // still on topic
  })
  it('rule-content: drift when similarity to rules drops below threshold', () => {
    expect(isDrift('rule-content', 0.9, 0.3, 0.6)).toBe(true)  // content far from rules
    expect(isDrift('rule-content', 0.1, 0.8, 0.6)).toBe(false) // content near rules
  })
})
