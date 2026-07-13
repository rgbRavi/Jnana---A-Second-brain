// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { detectSlashContext, filterSlashCommands, SLASH_COMMANDS } from './slashCommands'

describe('detectSlashContext', () => {
  it('detects a slash at the start of the document', () => {
    expect(detectSlashContext('/', 1)).toEqual({ from: 0, query: '' })
    expect(detectSlashContext('/head', 5)).toEqual({ from: 0, query: 'head' })
  })

  it('detects a slash at the start of a line', () => {
    const doc = 'first line\n/img'
    expect(detectSlashContext(doc, doc.length)).toEqual({ from: 11, query: 'img' })
  })

  it('detects a slash after whitespace mid-line', () => {
    const doc = 'take a note /quote'
    expect(detectSlashContext(doc, doc.length)).toEqual({ from: 12, query: 'quote' })
  })

  it('rejects a slash inside a URL', () => {
    const doc = 'see https://example.com'
    expect(detectSlashContext(doc, doc.length)).toBeNull()
  })

  it('rejects a slash glued to the end of a word', () => {
    expect(detectSlashContext('word/x', 6)).toBeNull()
  })

  it('rejects once whitespace follows the slash run', () => {
    // Cursor sits after the space — the run at the cursor no longer starts with `/`.
    const doc = '/head '
    expect(detectSlashContext(doc, doc.length)).toBeNull()
  })

  it('returns null for an out-of-range or zero cursor', () => {
    expect(detectSlashContext('/head', 0)).toBeNull()
    expect(detectSlashContext('/head', 99)).toBeNull()
  })
})

describe('filterSlashCommands', () => {
  it('returns the full registry for an empty query', () => {
    expect(filterSlashCommands('')).toHaveLength(SLASH_COMMANDS.length)
    expect(filterSlashCommands('   ')).toHaveLength(SLASH_COMMANDS.length)
  })

  it('matches on the label (case-insensitive)', () => {
    const ids = filterSlashCommands('HEAD').map((c) => c.id)
    expect(ids).toEqual(['h1', 'h2'])
  })

  it('matches on a keyword not present in the label', () => {
    // 'bullet'/'ul' are keywords of the "Bullet list" command; 'ol' of numbered.
    expect(filterSlashCommands('ul').map((c) => c.id)).toContain('ul')
    expect(filterSlashCommands('bookmark').map((c) => c.id)).toEqual(['webpage'])
  })

  it('preserves registry (group) order in results', () => {
    const res = filterSlashCommands('list')
    expect(res.map((c) => c.id)).toEqual(['ul', 'ol'])
  })

  it('includes colour and highlight commands routing to the colour action', () => {
    const red = SLASH_COMMANDS.find((c) => c.id === 'color-red')
    expect(red?.action).toEqual({ kind: 'color', variant: 'color', color: 'red' })
    const hl = SLASH_COMMANDS.find((c) => c.id === 'highlight-red')
    expect(hl?.action).toEqual({ kind: 'color', variant: 'highlight', color: 'red' })
  })

  it('filters to only highlight rows on the "highlight" keyword', () => {
    const ids = filterSlashCommands('highlight').map((c) => c.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((id) => id.startsWith('highlight-'))).toBe(true)
  })
})
