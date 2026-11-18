// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('picks one/other and groups digits', () => {
    expect(plural(1, 'note')).toBe('1 note')
    expect(plural(0, 'note')).toBe('0 notes')
    expect(plural(1204, 'note')).toMatch(/^1.204 notes$/)
    expect(plural(2, 'entry', 'entries')).toBe('2 entries')
  })
})
