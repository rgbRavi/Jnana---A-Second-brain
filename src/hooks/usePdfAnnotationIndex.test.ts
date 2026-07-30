// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { saveAttachmentText, listPdfAnnotationText } = vi.hoisted(() => ({
  saveAttachmentText: vi.fn().mockResolvedValue(undefined),
  listPdfAnnotationText: vi.fn(),
}))
vi.mock('../core/attachmentText', () => ({ saveAttachmentText }))
vi.mock('../core/annotations', () => ({ listPdfAnnotationText }))

import { eventBus } from '../lib/eventBus'
import { usePdfAnnotationIndex } from './usePdfAnnotationIndex'

describe('usePdfAnnotationIndex', () => {
  beforeEach(() => { saveAttachmentText.mockClear(); listPdfAnnotationText.mockReset() })

  it('persists annotation text + re-emits note:saved on annotation:created', async () => {
    listPdfAnnotationText.mockResolvedValue('note text')
    const emit = vi.spyOn(eventBus, 'emit')
    renderHook(() => usePdfAnnotationIndex())
    eventBus.emit('annotation:created', { id: 'a1', noteId: 'n1', kind: 'pdf_text' })
    await new Promise((r) => setTimeout(r, 0))
    expect(saveAttachmentText).toHaveBeenCalledWith('n1', '<annotations>', 'note text')
    expect(emit).toHaveBeenCalledWith('note:saved', expect.objectContaining({ id: 'n1' }))
  })

  it('ignores events without a noteId', async () => {
    renderHook(() => usePdfAnnotationIndex())
    eventBus.emit('annotation:deleted', { id: 'a1' })
    await new Promise((r) => setTimeout(r, 0))
    expect(saveAttachmentText).not.toHaveBeenCalled()
  })
})
