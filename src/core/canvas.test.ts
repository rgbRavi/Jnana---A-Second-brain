// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import {
  bringForward, bringToFront, eraseAt, parseDoc, sendBackward, sendToBack, serializeDoc,
  type CanvasDoc, type CanvasNode, type Drawing,
} from './canvas'

function node(id: string, layer?: 'below' | 'above'): CanvasNode {
  return { id, type: 'text', x: 0, y: 0, width: 100, height: 100, layer }
}

function docWithNodes(nodes: CanvasNode[]): CanvasDoc {
  return { nodes, edges: [], drawings: [] }
}

function drawing(id: string, points: [number, number, number][]): Drawing {
  return { id, points, color: '#000', size: 4 }
}

describe('canvas.ts', () => {
  describe('bringToFront / sendToBack', () => {
    it('moves the node to the end of the array and marks it above', () => {
      const doc = docWithNodes([node('a'), node('b'), node('c')])
      const next = bringToFront(doc, 'a')
      expect(next.nodes.map((n) => n.id)).toEqual(['b', 'c', 'a'])
      expect(next.nodes.find((n) => n.id === 'a')?.layer).toBe('above')
    })

    it('moves the node to the start of the array and marks it below', () => {
      const doc = docWithNodes([node('a'), node('b', 'above'), node('c')])
      const next = sendToBack(doc, 'c')
      expect(next.nodes.map((n) => n.id)).toEqual(['c', 'a', 'b'])
      expect(next.nodes.find((n) => n.id === 'c')?.layer).toBe('below')
    })

    it('is a no-op when the node is missing', () => {
      const doc = docWithNodes([node('a')])
      expect(bringToFront(doc, 'missing')).toBe(doc)
      expect(sendToBack(doc, 'missing')).toBe(doc)
    })
  })

  describe('bringForward / sendBackward', () => {
    it('swaps positions with the next sibling in the same layer, skipping other layers', () => {
      const doc = docWithNodes([node('a'), node('above-1', 'above'), node('b')])
      const next = bringForward(doc, 'a')
      // 'above-1' sits between them but isn't the same layer, so 'a' and 'b'
      // trade array positions directly (it's a swap, not a bubble-past-one-step).
      expect(next.nodes.map((n) => n.id)).toEqual(['b', 'above-1', 'a'])
    })

    it('swaps with the previous sibling in the same layer', () => {
      const doc = docWithNodes([node('a'), node('b'), node('above-1', 'above')])
      const next = sendBackward(doc, 'b')
      expect(next.nodes.map((n) => n.id)).toEqual(['b', 'a', 'above-1'])
    })

    it('is a no-op at the boundary (no same-layer sibling to swap with)', () => {
      const doc = docWithNodes([node('a'), node('b')])
      expect(bringForward(doc, 'b').nodes.map((n) => n.id)).toEqual(['a', 'b'])
      expect(sendBackward(doc, 'a').nodes.map((n) => n.id)).toEqual(['a', 'b'])
    })
  })

  describe('eraseAt', () => {
    it('stroke mode drops any stroke with a point within the radius', () => {
      const drawings = [
        drawing('hit', [[0, 0, 1], [5, 5, 1]]),
        drawing('miss', [[100, 100, 1], [105, 105, 1]]),
      ]
      const result = eraseAt(drawings, { x: 0, y: 0 }, 10, 'stroke')
      expect(result.map((d) => d.id)).toEqual(['miss'])
    })

    it('touch mode removes only the touched points, leaving the rest untouched', () => {
      const drawings = [drawing('a', [[0, 0, 1], [1, 0, 1], [100, 100, 1], [101, 100, 1]])]
      const result = eraseAt(drawings, { x: 0, y: 0 }, 5, 'touch')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('a')
      expect(result[0].points).toEqual([[100, 100, 1], [101, 100, 1]])
    })

    it('touch mode splits a stroke into separate drawings around an erased middle segment', () => {
      const drawings = [drawing('a', [
        [0, 0, 1], [1, 0, 1],       // surviving run 1
        [50, 50, 1],                // erased
        [100, 0, 1], [101, 0, 1],   // surviving run 2
      ])]
      const result = eraseAt(drawings, { x: 50, y: 50 }, 5, 'touch')
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('a')
      expect(result[0].points).toEqual([[0, 0, 1], [1, 0, 1]])
      expect(result[1].id).not.toBe('a')
      expect(result[1].points).toEqual([[100, 0, 1], [101, 0, 1]])
    })

    it('touch mode drops runs shorter than 2 points', () => {
      const drawings = [drawing('a', [[0, 0, 1], [50, 50, 1], [51, 50, 1]])]
      // The lone point at the start becomes a run of length 1 once [50,50] is hit — dropped.
      const result = eraseAt(drawings, { x: 50, y: 50 }, 5, 'touch')
      expect(result).toHaveLength(0)
    })

    it('leaves drawings untouched when nothing is within range', () => {
      const drawings = [drawing('a', [[0, 0, 1], [1, 0, 1]])]
      expect(eraseAt(drawings, { x: 1000, y: 1000 }, 5, 'touch')).toEqual(drawings)
      expect(eraseAt(drawings, { x: 1000, y: 1000 }, 5, 'stroke')).toEqual(drawings)
    })
  })

  describe('parseDoc / serializeDoc', () => {
    it('round-trips a custom background through serialize + parse', () => {
      const doc = docWithNodes([node('a')])
      doc.background = { type: 'color', value: '#1e1e2a' }
      const parsed = parseDoc(serializeDoc(doc))
      expect(parsed.background).toEqual({ type: 'color', value: '#1e1e2a' })
    })

    it('leaves background undefined when absent from older saved docs', () => {
      const parsed = parseDoc(JSON.stringify({ nodes: [], edges: [], drawings: [] }))
      expect(parsed.background).toBeUndefined()
    })
  })
})
