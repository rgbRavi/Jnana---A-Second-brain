// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { snippetAround, splitHighlight } from './searchSnippet'

describe('snippetAround', () => {
  const text = 'a'.repeat(200) + ' needle ' + 'b'.repeat(200)
  it('centres on the first match with ellipses on both cut ends', () => {
    const s = snippetAround(text, ['NEEDLE'])
    expect(s.startsWith('…')).toBe(true)
    expect(s.endsWith('…')).toBe(true)
    expect(s).toContain('needle')
    expect(s.length).toBeLessThan(200)
  })
  it('no leading ellipsis when match is near the start', () => {
    expect(snippetAround('hello world', ['world'])).toBe('hello world')
  })
  it('falls back to the first 180 chars', () => {
    expect(snippetAround('x'.repeat(300), ['zzz'])).toBe('x'.repeat(180) + '…')
  })
})

describe('splitHighlight', () => {
  it('highlights case-insensitively and extends prefix matches', () => {
    expect(splitHighlight('Learning is fun', ['learn'])).toEqual([
      { text: 'Learning', hit: true },
      { text: ' is fun', hit: false },
    ])
  })
  it('escapes regex-special characters', () => {
    expect(splitHighlight('I like c++ a lot', ['c++'])).toEqual([
      { text: 'I like ', hit: false },
      { text: 'c++', hit: true },
      { text: ' a lot', hit: false },
    ])
  })
  it('returns one text node when nothing matches', () => {
    expect(splitHighlight('nothing here', ['zzz'])).toEqual([{ text: 'nothing here', hit: false }])
  })
})
