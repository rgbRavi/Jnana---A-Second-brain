// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { edgeSide } from './tabDrag'

const rect = { left: 100, top: 0, width: 400, height: 200 }

describe('edgeSide', () => {
  it('picks the nearest edge inside the zone', () => {
    expect(edgeSide(rect, 110, 100)).toBe('left')
    expect(edgeSide(rect, 490, 100)).toBe('right')
    expect(edgeSide(rect, 300, 10)).toBe('above')
    expect(edgeSide(rect, 300, 190)).toBe('below')
  })
  it('returns null in the centre and for a degenerate rect', () => {
    expect(edgeSide(rect, 300, 100)).toBeNull()
    expect(edgeSide({ left: 0, top: 0, width: 0, height: 10 }, 0, 0)).toBeNull()
  })
  it('breaks corner ties toward the closer edge fraction', () => {
    // 5% from the left, 20% from the top → left wins.
    expect(edgeSide(rect, 120, 40)).toBe('left')
  })
})
