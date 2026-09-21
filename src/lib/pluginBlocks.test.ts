// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Blocks arrive from plugin code (and across postMessage from a worker), so this
// is a trust boundary: whatever comes in has to render as less UI, never as a
// crash and never as markup.

import { describe, it, expect } from 'vitest'
import { sanitizeBlocks } from './pluginBlocks'

describe('sanitizeBlocks', () => {
  it('keeps well-formed blocks as they are', () => {
    const blocks = sanitizeBlocks([
      { type: 'heading', text: 'Today' },
      { type: 'list', items: ['a', 'b'], ordered: true },
      { type: 'table', headers: ['k', 'v'], rows: [['x', '1']] },
      { type: 'button', label: 'Refresh', actionId: 'refresh' },
      { type: 'divider' },
    ])
    expect(blocks).toHaveLength(5)
    expect(blocks[1]).toEqual({ type: 'list', items: ['a', 'b'], ordered: true })
  })

  it('drops blocks it does not know instead of rendering them half-built', () => {
    expect(sanitizeBlocks([{ type: 'html', text: '<script>alert(1)</script>' }])).toEqual([])
    expect(sanitizeBlocks([{ type: 'button', label: 'Go' }])).toEqual([])
    expect(sanitizeBlocks([{ type: 'text' }, { type: 'list', items: [] }])).toEqual([])
  })

  it('survives nonsense rather than throwing', () => {
    expect(sanitizeBlocks(null)).toEqual([])
    expect(sanitizeBlocks('blocks')).toEqual([])
    expect(sanitizeBlocks([null, 42, undefined])).toEqual([])
  })

  it('coerces cell values and caps runaway sizes', () => {
    const [table] = sanitizeBlocks([
      { type: 'table', rows: [[1, true, { nope: 1 }]] },
    ])
    expect(table).toEqual({ type: 'table', rows: [['1', 'true', '']] })

    const [text] = sanitizeBlocks([{ type: 'text', text: 'x'.repeat(5000) }])
    expect(text).toMatchObject({ type: 'text' })
    expect((text as { text: string }).text).toHaveLength(2000)

    const many = sanitizeBlocks(Array.from({ length: 500 }, () => ({ type: 'divider' })))
    expect(many).toHaveLength(200)
  })
})
