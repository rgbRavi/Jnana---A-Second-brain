// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import type { Note } from '../types'
import { exportNoteContent, toExportMarkdown } from './export'

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    title: 'My Note',
    content: '',
    tags: [],
    createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
    updatedAt: Date.parse('2026-02-03T04:05:06.000Z'),
    ...overrides,
  }
}

describe('toExportMarkdown', () => {
  it('rewrites jnana-asset links to relative assets/ paths and collects the files', () => {
    const { markdown, assets } = toExportMarkdown('![img](jnana-asset://pic.png) and text')
    expect(markdown).toBe('![img](assets/pic.png) and text')
    expect(assets).toEqual(['pic.png'])
  })

  it('rewrites external:// links to assets/<basename> and decodes the path', () => {
    const enc = encodeURIComponent('C:\\Users\\me\\report.pdf')
    const { markdown, assets } = toExportMarkdown(`[doc](external://${enc})`)
    expect(markdown).toBe('[doc](assets/report.pdf)')
    expect(assets).toEqual(['report.pdf'])
  })

  it('turns youtube embeds into plain clickable links (no asset)', () => {
    const { markdown, assets } = toExportMarkdown('![youtube](https://youtu.be/abc)')
    expect(markdown).toBe('[▶ YouTube](https://youtu.be/abc)')
    expect(assets).toEqual([])
  })

  it('converts a ```table CSV block into a portable GFM pipe table', () => {
    const { markdown } = toExportMarkdown('intro\n\n```table\nMethod,Score\nbaseline,0.71\n```\n\nafter')
    expect(markdown).toContain('| Method | Score |')
    expect(markdown).toContain('| --- | --- |')
    expect(markdown).toContain('| baseline | 0.71 |')
    expect(markdown).not.toContain('```table')
  })

  it('escapes pipes in exported table cells', () => {
    const { markdown } = toExportMarkdown('```table\na\nx|y\n```')
    expect(markdown).toContain('| x\\|y |')
  })
})

describe('exportNoteContent', () => {
  it('emits YAML frontmatter with title, timestamps, tags and id', () => {
    const { content } = exportNoteContent(note({ tags: ['study', 'physics'] }))
    expect(content).toContain('---\n')
    expect(content).toContain('title: "My Note"')
    expect(content).toContain('created: 2026-01-02T03:04:05.000Z')
    expect(content).toContain('updated: 2026-02-03T04:05:06.000Z')
    expect(content).toContain('tags: ["study", "physics"]')
    expect(content).toContain('id: "n1"')
    // Frontmatter precedes the H1 title heading.
    expect(content.indexOf('---')).toBeLessThan(content.indexOf('# My Note'))
  })

  it('omits the tags line when there are none', () => {
    const { content } = exportNoteContent(note({ tags: [] }))
    expect(content).not.toContain('tags:')
  })

  it('escapes quotes and backslashes in the title', () => {
    const { content } = exportNoteContent(note({ title: 'a "quote" \\ slash' }))
    expect(content).toContain('title: "a \\"quote\\" \\\\ slash"')
  })

  it('carries the rewritten body + assets through', () => {
    const { content, assets } = exportNoteContent(
      note({ content: 'see ![img](jnana-asset://pic.png)' }),
    )
    expect(content).toContain('see ![img](assets/pic.png)')
    expect(assets).toEqual(['pic.png'])
  })
})
