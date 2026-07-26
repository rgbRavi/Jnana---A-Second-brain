// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { extractFragment, cloneFragment } from './canvasClipboard'

const doc = {
  nodes: [
    { id: 'a', type: 'text' as const, x: 0, y: 0, width: 10, height: 10 },
    { id: 'b', type: 'text' as const, x: 5, y: 5, width: 10, height: 10 },
    { id: 'c', type: 'text' as const, x: 99, y: 99, width: 10, height: 10 },
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b' },
    { id: 'e2', fromNode: 'a', toNode: 'c' }, // dangling for the a/b fragment
  ],
  drawings: [],
}

describe('canvasClipboard', () => {
  it('extracts nodes + only fully-internal edges', () => {
    const f = extractFragment(doc, new Set(['a', 'b']))
    expect(f.nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(f.edges.map((e) => e.id)).toEqual(['e1']) // e2 dropped (c not in set)
  })
  it('clone re-ids nodes+edges, remaps endpoints, offsets position', () => {
    const f = cloneFragment(extractFragment(doc, new Set(['a', 'b'])), 20, 20)
    expect(f.nodes.every((n) => n.id !== 'a' && n.id !== 'b')).toBe(true)
    const e = f.edges[0]
    expect(f.nodes.some((n) => n.id === e.fromNode)).toBe(true)
    expect(f.nodes.some((n) => n.id === e.toNode)).toBe(true)
    expect(f.nodes.find((n) => n.x === 20)).toBeTruthy() // 'a' at 0 offset by 20
  })
})
