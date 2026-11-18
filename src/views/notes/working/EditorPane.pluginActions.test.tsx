// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A plugin action in the editor pane must see what the user sees: unsaved edits
// are flushed before `run`, or the plugin reads stale content and anything it
// writes is overwritten by the pending autosave.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { Note } from '../../../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }))

const note = { id: 'n1', title: 'T', content: 'body', tags: [] } as unknown as Note
const notes = [note]
// Persist into the note like a real save, so a flush after the debounced autosave
// already fired (slow runs) is a no-op instead of a second update.
const update = vi.fn(async (_id: string, title: string, content: string) => {
  Object.assign(note, { title, content })
})
vi.mock('../../../context/NotesContext', () => ({
  useNotesContext: () => ({ notes, update, remove: vi.fn() }),
}))
vi.mock('../../../hooks/useComposer', () => ({
  useComposer: () => ({ uploading: false, isRecording: false, toolbarProps: {} }),
}))
vi.mock('../../../hooks/useFavourites', () => ({
  useFavourites: () => ({ addToFavourites: vi.fn(), removeFromFavourites: vi.fn(), fetchFavourites: async () => [] }),
}))
vi.mock('../../../hooks/useLinkRename', () => ({ useLinkRename: () => vi.fn() }))
vi.mock('../../../ui/editor/LiveEditor', () => ({ LiveEditor: () => null }))
vi.mock('../../../ui/editor/NoteRenderer', () => ({ NoteView: () => null, NoteTypeEditor: () => null }))
vi.mock('../../../ui/media/PdfViewer', () => ({ PdfViewer: () => null }))

import { EditorPane } from './EditorPane'
import { registerPluginAction, unregisterPluginActions } from '../../../lib/pluginActions'

describe('EditorPane plugin actions', () => {
  afterEach(() => {
    unregisterPluginActions('p.one')
    cleanup()
  })

  it('flushes unsaved edits before running a toolbar action', async () => {
    const savesSeenByRun: number[] = []
    registerPluginAction('p.one', 'One', {
      id: 'x',
      slot: 'editor.toolbar',
      label: 'Count',
      run: () => savesSeenByRun.push(update.mock.calls.length),
    })
    render(<EditorPane noteId="n1" />)
    fireEvent.change(screen.getByPlaceholderText('Title (optional)'), { target: { value: 'Edited' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Count' }))
    await waitFor(() => expect(savesSeenByRun).toHaveLength(1))
    expect(savesSeenByRun[0]).toBe(1)
  })
})
