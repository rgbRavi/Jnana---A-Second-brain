// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { nodesInMarquee, rectFromPoints } from './canvasSelect'

const N = (id: string, x: number, y: number) => ({ id, type: 'text' as const, x, y, width: 100, height: 100 })

describe('nodesInMarquee', () => {
  it('selects nodes overlapping the rect', () => {
    const nodes = [N('a', 0, 0), N('b', 500, 500), N('c', 50, 50)]
    expect(nodesInMarquee(nodes, { x: -10, y: -10, w: 120, h: 120 }).sort()).toEqual(['a', 'c'])
  })
  it('empty when disjoint', () => {
    expect(nodesInMarquee([N('a', 0, 0)], { x: 300, y: 300, w: 10, h: 10 })).toEqual([])
  })
})

describe('rectFromPoints', () => {
  it('normalizes a reverse drag to positive size', () => {
    expect(rectFromPoints(100, 100, 20, 40)).toEqual({ x: 20, y: 40, w: 80, h: 60 })
  })
})
