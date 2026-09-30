// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import type { Note } from '../types'

vi.mock('../core/mirror', () => ({
  mirrorNote: vi.fn(() => Promise.resolve()),
  unmirrorNote: vi.fn(() => Promise.resolve()),
  remirror: vi.fn(() => Promise.resolve()),
}))

import { mirrorNote, unmirrorNote, remirror } from '../core/mirror'
import { eventBus } from '../lib/eventBus'
import { setGeneralSettings } from './useGeneralSettings'
import { useMarkdownMirror } from './useMarkdownMirror'

const note = { id: 'n1', title: 'T', content: '', tags: [] } as unknown as Note

afterEach(() => {
  cleanup()
  setGeneralSettings({ mirrorDir: null })
})

describe('useMarkdownMirror', () => {
  it('mirrors saves, deletes and kind changes only while a folder is set', () => {
    setGeneralSettings({ mirrorDir: null })
    renderHook(() => useMarkdownMirror())
    eventBus.emit('note:saved', note)
    expect(mirrorNote).not.toHaveBeenCalled()

    act(() => setGeneralSettings({ mirrorDir: 'D:/m' }))
    eventBus.emit('note:saved', note)
    expect(mirrorNote).toHaveBeenCalledWith('D:/m', note)

    eventBus.emit('note:deleted', { id: 'n1' })
    expect(unmirrorNote).toHaveBeenCalledWith('D:/m', 'n1')

    eventBus.emit('note:kind-changed', { noteId: 'n1', kind: 'canvas', content: '{}' })
    expect(unmirrorNote).toHaveBeenCalledTimes(2)

    act(() => setGeneralSettings({ mirrorDir: null }))
    eventBus.emit('note:saved', note)
    expect(mirrorNote).toHaveBeenCalledTimes(1)
  })

  it('re-mirrors once, debounced, after vault/folder changes', () => {
    vi.useFakeTimers()
    try {
      renderHook(() => useMarkdownMirror())
      eventBus.emit('folder:changed', { id: 'f' })
      vi.advanceTimersByTime(1000)
      expect(remirror).not.toHaveBeenCalled() // mirroring is off

      act(() => setGeneralSettings({ mirrorDir: 'D:/m' }))
      for (const e of ['vault:changed', 'vault:deleted', 'folder:changed', 'folder:deleted', 'folder:moved', 'note:moved']) {
        eventBus.emit(e, { id: 'x' })
        eventBus.emit(e, { id: 'x' })
        vi.advanceTimersByTime(1000)
      }
      expect(remirror).toHaveBeenCalledTimes(6)
      expect(remirror).toHaveBeenLastCalledWith('D:/m')
    } finally {
      vi.useRealTimers()
    }
  })
})
