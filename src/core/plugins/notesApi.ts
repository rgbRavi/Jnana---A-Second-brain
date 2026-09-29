// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Note } from '../../types'
import type { PluginNotesApi } from '../../lib/pluginApi'
import { getActiveVaultId, noteInVault } from '../../lib/activeVault'
import { pluginLog } from '../../lib/pluginLog'
import { getAllNotes, getNote, saveNote, createNote } from '../notes'
import { guard } from './guard'

/**
 * The scoped notes API handed to plugins.
 *
 * **Scoped to the active vault.** A vault is how someone keeps work and personal
 * (or shared and private) notes apart, so "read and modify your notes" must not
 * quietly mean *all* of them: reads are filtered, and a write to a note outside
 * the active vault is refused rather than silently applied. Crossing vaults is
 * not something a plugin can opt into today — if that's ever needed it should be
 * its own permission, named as such in the consent prompt.
 *
 * Every call goes through `guard`, which rate-limits it and records it in the
 * activity trail. Writes are logged to the Plugin Console by name, so a plugin
 * editing notes leaves a visible trail.
 */
export function makePluginNotesApi(pluginId: string): PluginNotesApi {
  /** Fetch a note only if it is in the active vault; else `undefined`. */
  const inScope = async (noteId: string): Promise<Note | undefined> => {
    try {
      const note = await getNote(noteId)
      return noteInVault(note, getActiveVaultId()) ? note : undefined
    } catch {
      return undefined
    }
  }

  return {
    getAll(): Promise<Note[]> {
      return guard(pluginId, 'reads', async () => {
        const vaultId = getActiveVaultId()
        return (await getAllNotes()).filter((n) => noteInVault(n, vaultId))
      })
    },

    getById(id: string): Promise<Note | undefined> {
      return guard(pluginId, 'reads', () => inScope(id))
    },

    search(query: string): Promise<Note[]> {
      return guard(pluginId, 'reads', async () => {
        const needle = query.trim().toLowerCase()
        if (!needle) return []
        const vaultId = getActiveVaultId()
        return (await getAllNotes()).filter(
          (n) =>
            noteInVault(n, vaultId) &&
            (n.title.toLowerCase().includes(needle) || n.content.toLowerCase().includes(needle)),
        )
      })
    },

    create(title: string, content = ''): Promise<Note> {
      return guard(pluginId, 'writes', async () => {
        const note: Note = { ...createNote(title || 'Untitled'), content, vaultId: getActiveVaultId() }
        const saved = await saveNote(note)
        pluginLog('info', `Created note "${saved.title}"`, pluginId)
        return saved
      })
    },

    saveContent(noteId: string, content: string): Promise<void> {
      return guard(pluginId, 'writes', async () => {
        const note = await inScope(noteId)
        if (!note) {
          throw new Error('That note is not in the active vault.')
        }
        await saveNote({ ...note, content, updatedAt: Date.now() })
        pluginLog('info', `Edited note "${note.title}"`, pluginId)
      })
    },
  }
}
