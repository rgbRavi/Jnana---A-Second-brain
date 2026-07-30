// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => mockInvoke(...a) }))
vi.mock('../lib/eventBus', () => ({ eventBus: { emit: vi.fn() } }))

import { listPdfAnnotationText, makePdfRefAnnotation } from './annotations'

describe('listPdfAnnotationText', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('joins pdf_text + pdf_highlight content, skips ink/ref/empty', async () => {
    mockInvoke.mockResolvedValue([
      { id: '1', kind: 'pdf_text', content: 'a typed note' },
      { id: '2', kind: 'pdf_highlight', content: 'highlighted thought' },
      { id: '3', kind: 'pdf_ink', content: '' },
      { id: '4', kind: 'pdf_ref', content: '' },
      { id: '5', kind: 'pdf_text', content: '   ' },
    ])
    expect(await listPdfAnnotationText('n1')).toBe('a typed note\nhighlighted thought')
  })

  it('returns empty string when nothing textual', async () => {
    mockInvoke.mockResolvedValue([{ id: '1', kind: 'pdf_ink', content: '' }])
    expect(await listPdfAnnotationText('n1')).toBe('')
  })
})

it('makePdfRefAnnotation stores page/x/y in PDF points, empty content', () => {
  const a = makePdfRefAnnotation('n1', 'm.pdf', 4, 120.5, 300.25)
  expect(a.kind).toBe('pdf_ref')
  expect(a.content).toBe('')
  expect(JSON.parse(a.position)).toEqual({ page: 4, x: 120.5, y: 300.25 })
})
