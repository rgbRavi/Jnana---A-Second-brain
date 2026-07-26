// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { canvasToSearchText, canvasToExportMarkdown, EMPTY_CANVAS_CONTENT } from './canvasNote'
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
  it('empty canvas is a valid empty doc', () => {
    expect(canvasToSearchText(EMPTY_CANVAS_CONTENT)).toBe('')
  })
})
