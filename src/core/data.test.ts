// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: vi.fn() }))
const importMedia = vi.fn()
vi.mock('./media', () => ({ importMedia: (...a: unknown[]) => importMedia(...a), registerMediaRef: vi.fn() }))
vi.mock('./notes', () => ({ saveNote: vi.fn() }))
vi.mock('./tags', () => ({ inferTags: vi.fn(async () => []) }))

import { open } from '@tauri-apps/plugin-dialog'
import { importFilesAsNotes, mediaMarkdown, sanitizeLabel } from './data'

describe('mediaMarkdown', () => {
  it('strips characters that break link syntax and caps length', () => {
    expect(mediaMarkdown('document', 'a.pdf', 'my [file] (1)\nx.docx')).toBe('[my file 1 x.docx](jnana-asset://a.pdf)')
    expect(sanitizeLabel('x'.repeat(500))).toHaveLength(200)
    expect(sanitizeLabel('[]()')).toBe('file')
  })
})

describe('importFilesAsNotes', () => {
  beforeEach(() => importMedia.mockReset())
  it('keeps going when one file fails', async () => {
    vi.mocked(open).mockResolvedValue(['/a.pdf', '/b.pdf', '/c.pdf'])
    importMedia.mockImplementation(async (p: string) => {
      if (p === '/b.pdf') throw new Error('boom')
      return 'stored'
    })
    const progress = vi.fn()
    const r = await importFilesAsNotes('documents', progress)
    expect(r).toEqual({ imported: 2, failed: 1 })
    expect(progress).toHaveBeenLastCalledWith(3, 3)
  })
})
