// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { saveAttachmentText, listPdfAnnotationText, getNote } = vi.hoisted(() => ({
  saveAttachmentText: vi.fn().mockResolvedValue(undefined),
  listPdfAnnotationText: vi.fn(),
  getNote: vi.fn(),
}))
vi.mock('../core/attachmentText', () => ({ saveAttachmentText }))
vi.mock('../core/annotations', () => ({ listPdfAnnotationText }))
vi.mock('../core/notes', () => ({ getNote }))

import { eventBus } from '../lib/eventBus'
import { log } from '../lib/logger'
import { usePdfAnnotationIndex } from './usePdfAnnotationIndex'

describe('usePdfAnnotationIndex', () => {
  beforeEach(() => {
    saveAttachmentText.mockClear()
    listPdfAnnotationText.mockReset()
    getNote.mockReset()
  })

  it('re-emits note:saved with the full fetched note on annotation:created', async () => {
    listPdfAnnotationText.mockResolvedValue('note text')
    const fullNote = { id: 'n1', title: 'My note', content: 'body text', tags: ['a'] }
    getNote.mockResolvedValue(fullNote)
    const emit = vi.spyOn(eventBus, 'emit').mockClear()
    const { unmount } = renderHook(() => usePdfAnnotationIndex())
    eventBus.emit('annotation:created', { id: 'a1', noteId: 'n1', kind: 'pdf_text' })
    await new Promise((r) => setTimeout(r, 0))
    expect(saveAttachmentText).toHaveBeenCalledWith('n1', '<annotations>', 'note text')
    expect(getNote).toHaveBeenCalledWith('n1')
    expect(emit).toHaveBeenCalledWith(
      'note:saved',
      expect.objectContaining({ id: 'n1', title: 'My note', content: 'body text' })
    )
    unmount()
  })

  it('skips non-textual annotation:created kinds (e.g. pdf_ref) without indexing', async () => {
    const { unmount } = renderHook(() => usePdfAnnotationIndex())
    eventBus.emit('annotation:created', { id: 'a1', noteId: 'n1', kind: 'pdf_ref' })
    await new Promise((r) => setTimeout(r, 0))
    expect(saveAttachmentText).not.toHaveBeenCalled()
    unmount()
  })

  it('ignores events without a noteId', async () => {
    const { unmount } = renderHook(() => usePdfAnnotationIndex())
    eventBus.emit('annotation:deleted', { id: 'a1' })
    await new Promise((r) => setTimeout(r, 0))
    expect(saveAttachmentText).not.toHaveBeenCalled()
    unmount()
  })

  it('skips the note:saved re-emit and logs when getNote fails', async () => {
    listPdfAnnotationText.mockResolvedValue('note text')
    getNote.mockRejectedValue(new Error('not found'))
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const emit = vi.spyOn(eventBus, 'emit').mockClear()
    const { unmount } = renderHook(() => usePdfAnnotationIndex())
    eventBus.emit('annotation:created', { id: 'a1', noteId: 'n1', kind: 'pdf_text' })
    await new Promise((r) => setTimeout(r, 0))
    expect(saveAttachmentText).toHaveBeenCalledWith('n1', '<annotations>', 'note text')
    expect(emit).not.toHaveBeenCalledWith('note:saved', expect.anything())
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
    unmount()
  })
})
