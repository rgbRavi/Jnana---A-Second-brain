// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { snapDrag } from './canvasSnap'

describe('snapDrag', () => {
  it('snaps to grid when no neighbors', () => {
    const r = snapDrag({ x: 11, y: 5, w: 100, h: 100 }, [], 8, 6)
    expect(r.x).toBe(8)
    expect(r.y).toBe(8)
  })
  it('snaps left edge to a neighbor left edge and reports a guide', () => {
    const other = { x: 200, y: 0, w: 100, h: 100 }
    const r = snapDrag({ x: 197, y: 500, w: 100, h: 100 }, [other], 0, 6)
    expect(r.x).toBe(200)
    expect(r.guides).toContainEqual({ axis: 'x', at: 200 })
  })
  it('no like-for-like snap beyond threshold', () => {
    const r = snapDrag({ x: 150, y: 500, w: 100, h: 100 }, [{ x: 200, y: 0, w: 100, h: 100 }], 0, 6)
    expect(r.x).toBe(150)
    expect(r.guides).toEqual([])
  })
})
