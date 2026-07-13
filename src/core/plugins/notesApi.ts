// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Note } from '../../types'
import type { PluginNotesApi } from '../../lib/pluginApi'
import { getAllNotes, getNote, saveNote } from '../notes'

/**
 * The scoped notes API handed to plugins. Reads reuse the app's own note
 * commands; `saveContent` fetches the note, swaps its `content`, bumps
 * `updatedAt`, and persists via `saveNote` (which emits `note:saved`, so the app
 * re-indexes/re-renders). Placement (folder/vault) and `kind` are untouched —
 * `save_note` preserves them server-side.
 */
export function makePluginNotesApi(): PluginNotesApi {
  return {
    getAll(): Promise<Note[]> {
      return getAllNotes()
    },
    async getById(id: string): Promise<Note | undefined> {
      try {
        return await getNote(id)
      } catch {
        return undefined
      }
    },
    async saveContent(noteId: string, content: string): Promise<void> {
      const note = await getNote(noteId)
      await saveNote({ ...note, content, updatedAt: Date.now() })
    },
  }
}
