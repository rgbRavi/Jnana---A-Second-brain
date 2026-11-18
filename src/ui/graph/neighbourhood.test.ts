// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, expect, it } from 'vitest'
import { nodesWithinHops } from './neighbourhood'

const adj = (pairs: [string, string][]) => {
  const m = new Map<string, Set<string>>()
  for (const [a, b] of pairs) {
    if (!m.has(a)) m.set(a, new Set())
    if (!m.has(b)) m.set(b, new Set())
    m.get(a)!.add(b)
    m.get(b)!.add(a)
  }
  return m
}

describe('nodesWithinHops', () => {
  const chain = adj([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']])
  it('expands one hop at a time', () => {
    expect([...nodesWithinHops(chain, 'a', 1)].sort()).toEqual(['a', 'b'])
    expect([...nodesWithinHops(chain, 'a', 2)].sort()).toEqual(['a', 'b', 'c'])
    expect([...nodesWithinHops(chain, 'a', 3)].sort()).toEqual(['a', 'b', 'c', 'd'])
  })
  it('handles cycles', () => {
    const cyc = adj([['a', 'b'], ['b', 'c'], ['c', 'a']])
    expect([...nodesWithinHops(cyc, 'a', 3)].sort()).toEqual(['a', 'b', 'c'])
  })
  it('unknown start yields just itself', () => {
    expect([...nodesWithinHops(chain, 'zzz', 2)]).toEqual(['zzz'])
  })
})
