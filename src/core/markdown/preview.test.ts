// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { truncateMarkdown } from './preview'

describe('truncateMarkdown', () => {
  it('returns short content unchanged', () => {
    const s = 'A short note.\n\nWith two paragraphs.'
    expect(truncateMarkdown(s, 600)).toBe(s)
  })

  it('returns content at exactly the limit unchanged', () => {
    const s = 'x'.repeat(600)
    expect(truncateMarkdown(s, 600)).toBe(s)
  })

  it('truncates long content and appends an ellipsis', () => {
    const s = Array.from({ length: 50 }, (_, i) => `Line ${i} with some words here`).join('\n')
    const out = truncateMarkdown(s, 100)
    expect(out.length).toBeLessThan(s.length)
    expect(out.endsWith('…')).toBe(true)
  })

  it('cuts at a line boundary rather than mid-line', () => {
    const s = 'First line here\nSecond line here\nThird line here\nFourth line here'
    const out = truncateMarkdown(s, 20)
    // The body (before the ellipsis) should end at a full line, not mid-word.
    const body = out.replace(/\n\n…$/, '')
    expect(s.startsWith(body)).toBe(true)
    expect(body).toBe('First line here')
  })

  it('closes an unclosed code fence so the tail is not swallowed', () => {
    const s = '```js\n' + Array.from({ length: 40 }, (_, i) => `const x${i} = ${i}`).join('\n') + '\n```'
    const out = truncateMarkdown(s, 60)
    const fences = (out.match(/^```/gm) ?? []).length
    expect(fences % 2).toBe(0)
  })

  it('does not add a closing fence when fences are already balanced', () => {
    const s = '```\ncode\n```\n' + 'text '.repeat(300)
    const out = truncateMarkdown(s, 60)
    const fences = (out.match(/^```/gm) ?? []).length
    expect(fences % 2).toBe(0)
    expect(fences).toBe(2)
  })
})
