// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import { clusterColours, detectClusters } from './clusters'

function adj(edges: [string, string][], ids: string[] = []) {
  const m = new Map<string, Set<string>>()
  const add = (a: string, b: string) => {
    if (!m.has(a)) m.set(a, new Set())
    m.get(a)!.add(b)
  }
  for (const [a, b] of edges) {
    add(a, b)
    add(b, a)
  }
  for (const i of ids) if (!m.has(i)) m.set(i, new Set())
  return m
}
const tri = (a: string, b: string, c: string): [string, string][] => [[a, b], [b, c], [a, c]]

describe('detectClusters', () => {
  it('empty -> empty', () => {
    expect(detectClusters([], new Map()).size).toBe(0)
  })
  it('two disconnected triangles -> 2 clusters of 3', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const r = detectClusters(ids, adj([...tri('a', 'b', 'c'), ...tri('d', 'e', 'f')]))
    expect(new Set(r.values()).size).toBe(2)
    expect(r.get('a')).toBe(r.get('b'))
    expect(r.get('b')).toBe(r.get('c'))
    expect(r.get('d')).toBe(r.get('f'))
    expect(r.get('a')).not.toBe(r.get('d'))
  })
  it('isolated nodes are their own clusters, contiguous indices', () => {
    const r = detectClusters(['x', 'y', 'z'], new Map())
    expect([...r.values()].sort()).toEqual([0, 1, 2])
  })
  it('is deterministic', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const a = adj([...tri('a', 'b', 'c'), ...tri('d', 'e', 'f'), ['c', 'd']])
    expect([...detectClusters(ids, a)]).toEqual([...detectClusters(ids, a)])
  })
  it('a bridge between two dense groups still yields 2 clusters', () => {
    const k4 = (p: string) => {
      const n = [1, 2, 3, 4].map((i) => p + i)
      const e: [string, string][] = []
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) e.push([n[i], n[j]])
      return e
    }
    const ids = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4']
    const r = detectClusters(ids, adj([...k4('a'), ...k4('b'), ['a1', 'b1']]))
    expect(new Set(r.values()).size).toBe(2)
  })
  it('orders the largest cluster first', () => {
    const ids = ['a', 'b', 'c', 'x', 'y']
    const r = detectClusters(ids, adj([...tri('a', 'b', 'c')], ids))
    expect(r.get('a')).toBe(0)
  })
})

describe('clusterColours', () => {
  const clusters = new Map([
    ['a', 0], ['b', 0], ['c', 0],
    ['d', 1], ['e', 1], ['f', 1],
    ['g', 2], ['h', 2], ['i', 2],
    ['j', 3],
  ])
  it('colours largest clusters in order; skips small and overflow', () => {
    const r = clusterColours(clusters, ['#111', '#222'])
    expect(r.get('a')).toBe('#111')
    expect(r.get('d')).toBe('#222')
    expect(r.has('g')).toBe(false)
    expect(r.has('j')).toBe(false)
  })
  it('minSize respected', () => {
    expect(clusterColours(clusters, ['#111', '#222', '#333', '#444'], 1).get('j')).toBe('#444')
    expect(clusterColours(clusters, ['#111', '#222', '#333', '#444']).has('j')).toBe(false)
  })
})
