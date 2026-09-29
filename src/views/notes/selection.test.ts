// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { rangeBetween, selectRange, toggleSelected } from './selection'

const ids = ['a', 'b', 'c', 'd', 'e']

describe('toggleSelected', () => {
  it('adds an unselected id and removes a selected one', () => {
    expect([...toggleSelected(new Set(), 'b')]).toEqual(['b'])
    expect([...toggleSelected(new Set(['a', 'b']), 'b')]).toEqual(['a'])
  })

  it('returns a new set, leaving the original alone', () => {
    const before = new Set(['a'])
    const after = toggleSelected(before, 'b')
    expect(before.has('b')).toBe(false)
    expect(after).not.toBe(before)
  })
})

describe('rangeBetween', () => {
  it('covers both ends of the range', () => {
    expect(rangeBetween(ids, 'b', 'd')).toEqual(['b', 'c', 'd'])
  })

  it('reads the same in either direction', () => {
    expect(rangeBetween(ids, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })

  it('selects just the target when there is no anchor yet', () => {
    expect(rangeBetween(ids, null, 'c')).toEqual(['c'])
  })

  it('selects just the target when the anchor is no longer displayed', () => {
    // Anchor was filtered out between the two clicks.
    expect(rangeBetween(ids, 'zz', 'c')).toEqual(['c'])
  })

  it('is empty when the target itself is not displayed', () => {
    expect(rangeBetween(ids, 'a', 'zz')).toEqual([])
  })
})

describe('selectRange', () => {
  it('extends the existing selection rather than replacing it', () => {
    const out = selectRange(new Set(['e']), ids, 'a', 'b')
    expect([...out].sort()).toEqual(['a', 'b', 'e'])
  })
})
