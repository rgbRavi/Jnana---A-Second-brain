// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { canvasToSearchText, canvasToExportMarkdown, canvasToLinkText, canvasRenameLinks, canvasToMedia, EMPTY_CANVAS_CONTENT } from './canvasNote'
import { serializeDoc } from '../../core/canvas'

const doc = serializeDoc({
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 140, text: 'Hello world' },
    { id: 'b', type: 'link', x: 0, y: 0, width: 200, height: 140, url: 'https://ex.com' },
  ],
  edges: [],
  drawings: [],
})

describe('canvasNote projections', () => {
  it('search text collects text-node text', () => {
    expect(canvasToSearchText(doc)).toContain('Hello world')
  })
  it('export markdown lists nodes', () => {
    const md = canvasToExportMarkdown(doc)
    expect(md).toContain('Hello world')
    expect(md).toContain('https://ex.com')
  })
  it('link text carries text-card wikilinks and placed note cards, never drawing JSON', () => {
    const linked = serializeDoc({
      nodes: [
        { id: 't', type: 'text', x: 0, y: 0, width: 200, height: 140, text: 'see [[Alpha]]' },
        { id: 'n', type: 'note', x: 0, y: 0, width: 200, height: 140, noteId: 'b1' },
        { id: 'gone', type: 'note', x: 0, y: 0, width: 200, height: 140, noteId: 'missing' },
      ],
      edges: [],
      drawings: [{ id: 'd', points: [[1, 2, 0.5]], color: '#fff', size: 2 }],
    } as never)
    const text = canvasToLinkText(linked, (id) => (id === 'b1' ? 'Beta' : undefined))
    expect(text).toContain('[[Alpha]]')
    expect(text).toContain('[[Beta]]')
    expect(text).not.toContain('[[1')
  })
  it('rename rewrites text-card links only, and is a no-op when nothing matches', () => {
    const board = serializeDoc({
      nodes: [
        { id: 't', type: 'text', x: 0, y: 0, width: 1, height: 1, text: 'see [[Old]] and [[Keep]]' },
        { id: 'n', type: 'note', x: 0, y: 0, width: 1, height: 1, noteId: 'b1' },
      ],
      edges: [],
      drawings: [],
    })
    const renamed = canvasRenameLinks(board, 'old', 'New')
    expect(canvasToLinkText(renamed, () => undefined)).toBe('see [[New]] and [[Keep]]')
    expect(canvasRenameLinks(board, 'Missing', 'X')).toBe(board)
  })
  it('media lists media + web cards, deduped', () => {
    const board = serializeDoc({
      nodes: [
        { id: 'm', type: 'media', x: 0, y: 0, width: 1, height: 1, file: 'a.pdf', mediaType: 'pdf' },
        { id: 'm2', type: 'media', x: 0, y: 0, width: 1, height: 1, file: 'a.pdf', mediaType: 'pdf' },
        { id: 'w', type: 'link', x: 0, y: 0, width: 1, height: 1, url: 'https://youtu.be/x' },
        { id: 't', type: 'text', x: 0, y: 0, width: 1, height: 1, text: 'hi' },
      ],
      edges: [],
      drawings: [],
    })
    expect(canvasToMedia(board).map((m) => [m.kind, m.target])).toEqual([
      ['pdf', 'a.pdf'],
      ['youtube', 'https://youtu.be/x'],
    ])
  })
  it('empty canvas is a valid empty doc', () => {
    expect(canvasToSearchText(EMPTY_CANVAS_CONTENT)).toBe('')
  })
})
