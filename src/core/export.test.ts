// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Note } from '../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(async () => 'D:/out') }))
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: vi.fn() }))
vi.mock('../lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
// A typed note whose projection is its raw content (like a canvas list).
vi.mock('../lib/noteTypes', () => ({
  getNoteType: (n: { kind?: string | null }) => (n.kind === 'canvas' ? { toExportMarkdown: (x: Note) => x.content } : undefined),
}))

import { invoke } from '@tauri-apps/api/core'
import { toast } from '../lib/toast'
import { exportNoteContent, exportNotes, safeName, toExportMarkdown } from './export'

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

const mk = (id: string, title: string, content = '', kind: string | null = null) =>
  ({ id, title, content, tags: [], kind, createdAt: 0, updatedAt: 0 }) as unknown as Note

beforeEach(() => vi.mocked(toast.error).mockClear())

describe('safeName', () => {
  it('suffixes Windows reserved device names, with or without an extension', () => {
    expect(safeName('CON')).toBe('CON_')
    expect(safeName('nul')).toBe('nul_')
    expect(safeName('com1.notes')).toBe('com1_.notes')
    expect(safeName('Console')).toBe('Console')
  })

  it('drops trailing dots and spaces, which Windows silently strips', () => {
    expect(safeName('Chapter 1.')).toBe('Chapter 1')
    expect(safeName('...')).toBe('Untitled')
  })

  it('never cuts an emoji in half at the length limit', () => {
    expect(safeName('a'.repeat(79) + '😀😀')).toBe('a'.repeat(79) + '😀')
  })
})

describe('exportNoteContent', () => {
  it('turns canvas note cards into [[Title]] links', () => {
    const titles: Record<string, string> = { b1: 'Alpha' }
    const out = exportNoteContent(mk('c', 'Board', '- [[note:b1]]\n- [[note:gone]]', 'canvas'), 'assets', (id) => titles[id])
    expect(out.content).toContain('- [[Alpha]]')
    expect(out.content).toContain('- (missing note)')
  })

  it('leaves a plain note that happens to contain [[note:x]] alone', () => {
    expect(exportNoteContent(mk('p', 'P', '[[note:x]]'), 'assets', () => 'X').content).toContain('[[note:x]]')
  })
})

describe('exportNotes', () => {
  it('counts written files and names the ones that failed', async () => {
    vi.mocked(invoke).mockResolvedValue({ written: 1, failed: ['B.md'] })
    const res = await exportNotes([mk('a', 'A'), mk('b', 'B')])
    expect(res?.count).toBe(1)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('B.md'))
  })
})
