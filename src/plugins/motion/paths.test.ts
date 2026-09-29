// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { arcPoints } from './paths'

const box = (left: number, top: number) => ({ left, top, width: 20, height: 20 })

describe('arcPoints', () => {
  it('starts at zero offset, ends on the target centre, peaks by lift', () => {
    const pts = arcPoints(box(0, 100), box(200, 100), 4, 50)
    expect(pts).toHaveLength(5)
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts[4]).toEqual({ x: 200, y: 0 })
    expect(pts[2]).toEqual({ x: 100, y: -50 })
  })
})
