// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import { shortestPath } from './graphPath'

const adj = (edges: [string, string][]) => {
  const m = new Map<string, Set<string>>()
  const add = (a: string, b: string) => m.set(a, (m.get(a) ?? new Set()).add(b))
  for (const [a, b] of edges) {
    add(a, b)
    add(b, a)
  }
  return m
}

describe('shortestPath', () => {
  it('finds a direct link', () => {
    expect(shortestPath(adj([['a', 'b']]), 'a', 'b')).toEqual(['a', 'b'])
  })
  it('finds a 2-hop path, in either direction', () => {
    const g = adj([['a', 'b'], ['b', 'c']])
    expect(shortestPath(g, 'a', 'c')).toEqual(['a', 'b', 'c'])
    expect(shortestPath(g, 'c', 'a')).toEqual(['c', 'b', 'a'])
  })
  it('picks a shortest of several routes', () => {
    const g = adj([['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'x'], ['x', 'd']])
    expect(shortestPath(g, 'a', 'd')).toEqual(['a', 'x', 'd'])
  })
  it('returns null when unreachable', () => {
    expect(shortestPath(adj([['a', 'b'], ['c', 'd']]), 'a', 'd')).toBeNull()
    expect(shortestPath(adj([]), 'a', 'b')).toBeNull()
  })
  it('returns just the node for the same note', () => {
    expect(shortestPath(adj([]), 'a', 'a')).toEqual(['a'])
  })
})
