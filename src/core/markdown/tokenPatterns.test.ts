// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { docRefRegex, docRefAnchored } from './tokenPatterns'

describe('docRef token', () => {
  it('captures index, page, x, y', () => {
    const m = docRefRegex().exec('see [D0::p4@0.42,0.68] here')
    expect(m?.slice(1, 5)).toEqual(['0', '4', '0.42', '0.68'])
  })
  it('anchored matches only at start', () => {
    expect(docRefAnchored().exec('[D2::p1@0,0.5]')?.[2]).toBe('1')
    expect(docRefAnchored().exec('x [D2::p1@0,0.5]')).toBeNull()
  })
  it('rejects malformed', () => {
    expect(docRefRegex().exec('[D0::p4]')).toBeNull()
  })
})
