// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import type { Note } from '../../types'
import { distanceToSegment, linkedKeys, nearestPair, pairKey, tagPairs } from './suggestedLinks'

function note(id: string, tags: string[] = []): Note {
  return { id, title: id, content: '', tags, createdAt: 0, updatedAt: 0 }
}

describe('suggestedLinks', () => {
  it('pairs notes sharing a user tag, once per pair', () => {
    const notes = [note('a', ['physics']), note('b', ['physics']), note('c', ['physics', 'optics'])]
    const pairs = tagPairs(notes, [])
    expect(pairs.map((p) => pairKey(p.a, p.b)).sort()).toEqual(['a|b', 'a|c', 'b|c'])
  })

  it('orders each pair so a < b', () => {
    const pairs = tagPairs([note('z', ['t']), note('a', ['t'])], [])
    expect(pairs).toEqual([{ a: 'a', b: 'z', reason: 'both tagged #t' }])
  })

  it('skips pairs already linked in either direction', () => {
    const notes = [note('a', ['physics']), note('b', ['physics'])]
    expect(tagPairs(notes, [['b', 'a']])).toEqual([])
  })

  it('ignores auto-tags — they describe media, not subject', () => {
    expect(tagPairs([note('a', ['has:image']), note('b', ['has:image'])], [])).toEqual([])
  })

  it('skips tags carried by more than 25 notes as too generic', () => {
    const many = Array.from({ length: 26 }, (_, i) => note(`n${i}`, ['inbox']))
    expect(tagPairs(many, [])).toEqual([])
    expect(tagPairs(many.slice(0, 25), []).length).toBeGreaterThan(0)
  })

  it('builds link keys direction-independently', () => {
    const keys = linkedKeys([['b', 'a']])
    expect(keys.has(pairKey('a', 'b'))).toBe(true)
  })
})

describe('nearestPair', () => {
  const at: Record<string, { x: number; y: number }> = {
    a: { x: 0, y: 0 },
    b: { x: 10, y: 0 },
    c: { x: 0, y: 100 },
    d: { x: 10, y: 100 },
  }
  const positionOf = (id: string) => at[id]
  const pairs = [
    { a: 'a', b: 'b', reason: 'near' },
    { a: 'c', b: 'd', reason: 'far' },
  ]

  it('picks the line the point sits closest to', () => {
    expect(nearestPair(pairs, positionOf, { x: 5, y: 2 }, 5)?.reason).toBe('near')
    expect(nearestPair(pairs, positionOf, { x: 5, y: 98 }, 5)?.reason).toBe('far')
  })

  it('returns null when nothing is within range', () => {
    expect(nearestPair(pairs, positionOf, { x: 5, y: 50 }, 5)).toBeNull()
  })

  it('measures to the segment, not the infinite line', () => {
    // Straight off the end of a–b: distance is to the endpoint, so out of range.
    expect(nearestPair(pairs, positionOf, { x: 30, y: 0 }, 5)).toBeNull()
  })

  it('skips pairs whose endpoints are not placed yet', () => {
    expect(nearestPair([{ a: 'a', b: 'ghost', reason: 'x' }], positionOf, { x: 0, y: 0 }, 5)).toBeNull()
  })

  it('treats a degenerate segment as a point', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
  })
})
