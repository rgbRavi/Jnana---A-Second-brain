// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, expect, it } from 'vitest'
import { timeRange, visibleAt, visibleIds } from './timeline'

describe('timeRange', () => {
  it('is null for no notes', () => expect(timeRange([])).toBeNull())
  it('single date gives min === max', () => expect(timeRange([{ createdAt: 5 }])).toEqual({ min: 5, max: 5 }))
  it('spans min..max and ignores pseudo-nodes', () =>
    expect(timeRange([{ createdAt: 9 }, { createdAt: 2 }, { isPseudo: true, createdAt: 99 }])).toEqual({ min: 2, max: 9 }))
})

describe('visibleAt', () => {
  it('boundary is inclusive', () => {
    expect(visibleAt(5, 5)).toBe(true)
    expect(visibleAt(6, 5)).toBe(false)
  })
})

describe('visibleIds', () => {
  const nodes = [
    { id: 'a', createdAt: 1 },
    { id: 'b', createdAt: 5 },
    { id: 'p', isPseudo: true },
  ]
  const links = [{ source: 'a', target: 'p' }, { source: { id: 'b' }, target: { id: 'p' } }]
  it('hides later notes; pseudo shows once a visible note links to it', () => {
    expect([...visibleIds(nodes, links, 0)]).toEqual([])
    expect([...visibleIds(nodes, links, 1)].sort()).toEqual(['a', 'p'])
    expect([...visibleIds(nodes, links, 5)].sort()).toEqual(['a', 'b', 'p'])
  })
  it('pseudo with no visible referrer stays hidden', () => {
    expect(visibleIds([{ id: 'b', createdAt: 5 }, { id: 'p', isPseudo: true }], [{ source: 'b', target: 'p' }], 1).size).toBe(0)
  })
})
