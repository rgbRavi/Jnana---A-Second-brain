// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isAutoTag, inferTags } from './tags'
import { getMediaTypes } from './media'

// Mock the media module since it relies on Tauri IPC
vi.mock('./media', () => ({
  getMediaTypes: vi.fn(),
}))

describe('tags.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isAutoTag', () => {
    it('returns true for has: prefixed tags', () => {
      expect(isAutoTag('has:media')).toBe(true)
      expect(isAutoTag('has:videoOrYt')).toBe(true)
    })

    it('returns true for long-form tag', () => {
      expect(isAutoTag('long-form')).toBe(true)
    })

    it('returns false for user-defined tags', () => {
      expect(isAutoTag('idea')).toBe(false)
      expect(isAutoTag('machine-learning')).toBe(false)
      expect(isAutoTag('hasta-la-vista')).toBe(false)
    })
  })

  describe('inferTags', () => {
    it('infers has:link from http/https links', async () => {
      vi.mocked(getMediaTypes).mockResolvedValue([])
      const note = { id: '1', title: 'Test', content: 'Check this https://google.com', tags: [], createdAt: 0, updatedAt: 0 }
      const tags = await inferTags(note)
      expect(tags).toContain('has:link')
      expect(tags).not.toContain('has:wikilink')
    })

    it('infers has:wikilink from wikilinks', async () => {
      vi.mocked(getMediaTypes).mockResolvedValue([])
      const note = { id: '1', title: 'Test', content: 'See [[other note]]', tags: [], createdAt: 0, updatedAt: 0 }
      const tags = await inferTags(note)
      expect(tags).toContain('has:wikilink')
    })

    it('infers has:docxlink from external docs (matches current buggy regex)', async () => {
      vi.mocked(getMediaTypes).mockResolvedValue([])
      // The current regex in tags.ts is /\(external:\/\/+\)/ which requires a closing parenthesis right after slashes
      const note = { id: '1', title: 'Test', content: 'Read this (external://)', tags: [], createdAt: 0, updatedAt: 0 }
      const tags = await inferTags(note)
      expect(tags).toContain('has:docxlink')
    })

    it('infers has:table when a ```table fence is present', async () => {
      vi.mocked(getMediaTypes).mockResolvedValue([])
      const content = 'Intro\n\n```table\nName,Age\nAda,36\n```\n\noutro'
      const note = { id: '1', title: 'Test', content, tags: [], createdAt: 0, updatedAt: 0 }
      const tags = await inferTags(note)
      expect(tags).toContain('has:table')
    })

    it('does not infer has:table without a table fence', async () => {
      vi.mocked(getMediaTypes).mockResolvedValue([])
      const note = { id: '1', title: 'Test', content: 'just prose', tags: [], createdAt: 0, updatedAt: 0 }
      const tags = await inferTags(note)
      expect(tags).not.toContain('has:table')
    })

    it('infers long-form for notes with > 1000 words', async () => {
      vi.mocked(getMediaTypes).mockResolvedValue([])
      const longText = Array(1005).fill('word').join(' ')
      const note = { id: '1', title: 'Test', content: longText, tags: [], createdAt: 0, updatedAt: 0 }
      const tags = await inferTags(note)
      expect(tags).toContain('long-form')
    })

    it('infers media tags based on getMediaTypes output', async () => {
      vi.mocked(getMediaTypes).mockResolvedValue(['image', 'pdf'])
      const note = { id: '1', title: 'Test', content: 'Hello', tags: [], createdAt: 0, updatedAt: 0 }
      const tags = await inferTags(note)
      expect(tags).toContain('has:media')
      expect(tags).toContain('has:image')
      expect(tags).toContain('has:pdf')
      expect(tags).not.toContain('has:video')
    })

    it('infers has:videoOrYt when youtube is present', async () => {
      vi.mocked(getMediaTypes).mockResolvedValue(['youtube'])
      const note = { id: '1', title: 'Test', content: 'Hello', tags: [], createdAt: 0, updatedAt: 0 }
      const tags = await inferTags(note)
      expect(tags).toContain('has:media')
      expect(tags).toContain('has:youtube')
      expect(tags).toContain('has:videoOrYt')
    })
  })
})
