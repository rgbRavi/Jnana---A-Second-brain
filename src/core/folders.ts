// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Rust-calling service for the virtual folder tree (the single global "vault").
// Folders are an additive lens over notes — see commands/folders.rs. Mutations
// emit stringly-typed bus events so the sidebar tree and notes list re-sync
// without prop-drilling (mirrors core/workspaces.ts).

import { invoke } from '@tauri-apps/api/core'
import type { Folder } from '../types'
import { eventBus } from '../lib/eventBus'

/** The whole folder tree as a flat list; callers build the adjacency list. */
export async function listFolders(): Promise<Folder[]> {
  return invoke<Folder[]>('list_folders')
}

/** Create / rename / reposition a folder (upsert). Reparenting → `moveFolder`. */
export async function saveFolder(folder: Folder): Promise<void> {
  await invoke<void>('save_folder', { folder })
  eventBus.emit('folder:changed', { id: folder.id })
}

/** Delete a folder; sub-folders cascade, contained notes fall back to unfiled.
 *  (The UI's "folder + notes" option deletes the notes separately first.) */
export async function deleteFolder(id: string): Promise<void> {
  await invoke<void>('delete_folder', { id })
  eventBus.emit('folder:deleted', { id })
}

/** Reparent a folder. Rejects a cycle (into itself / a descendant) — the Rust
 *  command returns an error string which surfaces to the caller's catch. */
export async function moveFolder(id: string, parentId: string | null): Promise<void> {
  await invoke<void>('move_folder', { id, parentId })
  eventBus.emit('folder:moved', { id, parentId })
}

/** Set (or clear, with `folderId = null`) a note's folder within a vault. The
 *  note's vault always moves with it (matches the folder's vault; on unfile the
 *  caller passes the vault to keep it in). */
export async function setNoteFolder(
  noteId: string,
  folderId: string | null,
  vaultId: string,
): Promise<void> {
  await invoke<void>('set_note_folder', { noteId, folderId, vaultId })
  eventBus.emit('note:moved', { noteId, folderId, vaultId })
}

/** Factory for a new folder row in a given vault (top-level or nested). */
export function createFolder(vaultId: string, name = 'New Folder', parentId: string | null = null): Folder {
  const now = Date.now()
  return { id: crypto.randomUUID(), parentId, name, vaultId, position: now, createdAt: now, updatedAt: now }
}
