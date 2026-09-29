// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AiConfig, Note } from '../../types'

const { invokeMock, embedMock, loadImage, renderPages, pdfText } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  embedMock: vi.fn(),
  loadImage: vi.fn(),
  renderPages: vi.fn(),
  pdfText: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }))
vi.mock('./provider', () => ({ getEmbeddingProvider: () => ({ embed: embedMock }) }))
vi.mock('../media/visionImages', () => ({ loadImageForVision: loadImage, renderPdfPagesForVision: renderPages }))
vi.mock('../media/pdfText', () => ({ extractPdfText: pdfText }))

import { allocate, buildNoteContext, maxNotesFor, mediaIn, pickPassages } from './noteContext'

const config = { enabled: true, chatModel: 'llama3' } as unknown as AiConfig
const visionConfig = { enabled: true, chatModel: 'gpt-4o' } as unknown as AiConfig
const note = (id: string, title: string, content: string): Note =>
  ({ id, title, content, tags: [], createdAt: 1, updatedAt: 1 }) as unknown as Note
/** n paragraphs, each ~1000 chars and labelled, so chunkNote makes one chunk per paragraph. */
const longBody = (n: number) => Array.from({ length: n }, (_, i) => `P${i} ${'x'.repeat(1000)}`).join('\n\n')

beforeEach(() => {
  invokeMock.mockReset()
  embedMock.mockReset()
  loadImage.mockReset()
  renderPages.mockReset()
  pdfText.mockReset()
})

describe('allocate', () => {
  it('lets short notes keep everything and gives the rest to long ones', () => {
    expect(allocate([100, 5000, 5000], 3100)).toEqual([100, 1500, 1500])
  })
  it('never hands out more than a note has, or more than the budget', () => {
    const a = allocate([10, 20], 1000)
    expect(a).toEqual([10, 20])
    expect(allocate([900, 900, 900], 900).reduce((s, x) => s + x, 0)).toBeLessThanOrEqual(900)
  })
})

describe('pickPassages', () => {
  const passages = ['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100), 'd'.repeat(100), 'e'.repeat(100)]

  it('spreads across the note (not just the opening) when there is no query', () => {
    const out = pickPassages(passages, 220)
    expect(out.startsWith('a')).toBe(true)
    expect(out.endsWith('e')).toBe(true) // the last passage is in, not only the first two
    expect(out).toContain('[…]')
  })

  it('prefers the highest-scoring passages and keeps document order', () => {
    const out = pickPassages(passages, 220, [0.1, undefined, 0.9, 0.2, 0.8])
    expect(out.indexOf('c')).toBeGreaterThanOrEqual(0)
    expect(out.indexOf('e')).toBeGreaterThan(out.indexOf('c'))
    expect(out).not.toContain('a')
  })

  it("falls back to the top passage's opening when none fits whole", () => {
    expect(pickPassages(['z'.repeat(500)], 50)).toBe('z'.repeat(50))
  })
})

describe('maxNotesFor', () => {
  it('keeps the old 8 for small budgets and grows, capped', () => {
    expect(maxNotesFor(3000)).toBe(8)
    expect(maxNotesFor(32_000)).toBe(16)
    expect(maxNotesFor(1_000_000)).toBe(40)
  })
})

describe('buildNoteContext', () => {
  it('sends whole notes with embed links stripped and PDF text appended when they fit', async () => {
    invokeMock.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === 'get_attachment_text' ? 'Text from inside the PDF' : []),
    )
    const out = await buildNoteContext(
      [note('1', 'Lecture', 'Intro paragraph.\n\n![pdf](jnana-asset://slides.pdf)\n\nClosing words.')],
      { budgetTokens: 32_000, config },
    )
    expect(out.images).toEqual([]) // llama3 has no vision
    expect(out.text).toContain('### Note 1: Lecture\n')
    expect(out.text).toContain('Intro paragraph.')
    expect(out.text).toContain('Closing words.')
    expect(out.text).toContain('Text from inside the PDF')
    expect(out.text).not.toContain('jnana-asset://')
    expect(out.text).not.toContain('(excerpts)')
  })

  it('uses the most relevant indexed passages for an over-long note when there is a query', async () => {
    const n = note('1', 'Big', longBody(10))
    embedMock.mockResolvedValue([[1, 0]])
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_attachment_text') return Promise.resolve('')
      // The index says passage 7 is the match.
      return Promise.resolve([{ noteId: '1', chunkIndex: 7, chunkText: `Big\n\nP7 ${'x'.repeat(1000)}`, score: 0.95 }])
    })
    const { text } = await buildNoteContext([n], { budgetTokens: 1000, config, query: 'what is P7?' })
    expect(text).toContain('(excerpts)')
    expect(text).toContain('P7 ')
  })

  it('spreads passages when the index has nothing for the note', async () => {
    embedMock.mockResolvedValue([[1, 0]])
    invokeMock.mockImplementation((cmd: string) => Promise.resolve(cmd === 'get_attachment_text' ? '' : []))
    const { text } = await buildNoteContext([note('1', 'Big', longBody(10))], { budgetTokens: 1000, config, query: 'q' })
    expect(text).toContain('P0 ')
    expect(text).toContain('P9 ') // end of the note is represented, not only the opening
  })

  it('attaches images and scanned-PDF pages for a vision model, skipping text PDFs', async () => {
    invokeMock.mockResolvedValue('')
    loadImage.mockResolvedValue('data:image/jpeg;base64,IMG')
    pdfText.mockImplementation((f: string) => Promise.resolve(f === 'text.pdf' ? 'real text' : ''))
    renderPages.mockResolvedValue(['data:image/jpeg;base64,P1', 'data:image/jpeg;base64,P2'])
    const content = [
      'Diagram below.',
      '![image](jnana-asset://diagram.png)',
      '![pdf](jnana-asset://text.pdf)',
      '![pdf](jnana-asset://scan.pdf)',
    ].join('\n\n')
    const out = await buildNoteContext([note('1', 'Slides', content)], { budgetTokens: 32_000, config: visionConfig })
    expect(out.images).toEqual(['data:image/jpeg;base64,IMG', 'data:image/jpeg;base64,P1', 'data:image/jpeg;base64,P2'])
    expect(out.text).toContain('Image 1 — diagram.png')
    expect(out.text).toContain('Image 2 — scan.pdf, page 1 (scanned)')
    expect(out.text).not.toContain('text.pdf')
    expect(out.text).toContain('3 images are attached')
  })

  it('shares the image allowance across notes', async () => {
    invokeMock.mockResolvedValue('')
    loadImage.mockImplementation((f: string) => Promise.resolve(`data:${f}`))
    const many = (p: string) => Array.from({ length: 5 }, (_, i) => `![image](jnana-asset://${p}${i}.png)`).join('\n\n')
    // 8k tokens → 2 images: one from each note, not two from the first.
    const out = await buildNoteContext([note('1', 'A', many('a')), note('2', 'B', many('b'))], {
      budgetTokens: 8_000,
      config: visionConfig,
    })
    expect(out.images).toEqual(['data:a0.png', 'data:b0.png'])
  })
})

describe('mediaIn', () => {
  it('finds image and PDF asset embeds in order, ignoring other media and remote images', () => {
    const c = '![a](jnana-asset://x.png) ![v](jnana-asset://clip.mp4) ![p](jnana-asset://doc.pdf) ![r](https://e.com/y.png)'
    expect(mediaIn(c)).toEqual([
      { filename: 'x.png', kind: 'image' },
      { filename: 'doc.pdf', kind: 'pdf' },
    ])
  })
})
