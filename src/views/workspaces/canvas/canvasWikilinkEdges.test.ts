// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { deriveWikilinkEdges } from './canvasWikilinkEdges'

const note = (id: string, title: string, content: string) => ({ id, title, content })
const card = (id: string, noteId: string) => ({ id, type: 'note' as const, x: 0, y: 0, width: 1, height: 1, noteId })

describe('deriveWikilinkEdges', () => {
  it('links two placed cards when one wikilinks the other', () => {
    const nodes = [card('n1', 'A'), card('n2', 'B')]
    const notes = new Map([
      ['A', note('A', 'Alpha', 'see [[Beta]]')],
      ['B', note('B', 'Beta', 'hi')],
    ])
    expect(deriveWikilinkEdges(nodes, notes)).toEqual([{ fromNode: 'n1', toNode: 'n2' }])
  })
  it('no edge when the target card is not placed', () => {
    const nodes = [card('n1', 'A')]
    const notes = new Map([['A', note('A', 'Alpha', '[[Beta]]')]])
    expect(deriveWikilinkEdges(nodes, notes)).toEqual([])
  })
  it('dedupes a mutual link into one edge', () => {
    const nodes = [card('n1', 'A'), card('n2', 'B')]
    const notes = new Map([
      ['A', note('A', 'Alpha', '[[Beta]]')],
      ['B', note('B', 'Beta', '[[Alpha]]')],
    ])
    expect(deriveWikilinkEdges(nodes, notes)).toHaveLength(1)
  })
})
