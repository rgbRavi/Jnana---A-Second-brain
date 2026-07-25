// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'

// pdfEmbedFilenames is a pure regex helper — this test only exercises it. Mock
// out the module's other imports so loading it doesn't pull in pdfjs-dist
// (which touches `DOMMatrix`, unavailable in jsdom) or the Tauri-backed
// attachment-text save.
vi.mock('../core/media/pdfText', () => ({ extractPdfText: vi.fn() }))
vi.mock('../core/attachmentText', () => ({ saveAttachmentText: vi.fn() }))

import { pdfEmbedFilenames } from './usePdfTextIndex'

describe('pdfEmbedFilenames', () => {
  it('extracts every pdf embed filename in document order', () => {
    const md = 'intro\n\n![pdf](jnana-asset://a.pdf)\n\nmid ![pdf](jnana-asset://b.pdf) end'
    expect(pdfEmbedFilenames(md)).toEqual(['a.pdf', 'b.pdf'])
  })

  it('returns [] when there are no pdf embeds', () => {
    expect(pdfEmbedFilenames('just text ![img](jnana-asset://x.png)')).toEqual([])
  })

  it('ignores non-pdf asset embeds', () => {
    const md = '![video](jnana-asset://v.mp4)\n![pdf](jnana-asset://doc.pdf)'
    expect(pdfEmbedFilenames(md)).toEqual(['doc.pdf'])
  })
})
