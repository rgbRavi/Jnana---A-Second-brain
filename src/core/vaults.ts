// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Rust-calling service for vaults (the Obsidian-style top-level container).
// Mutations emit stringly-typed bus events so the explorer, vault switcher, and
// scoped notes views re-sync without prop-drilling (mirrors core/folders.ts).

import { invoke } from '@tauri-apps/api/core'
import type { Vault } from '../types'
import { eventBus } from '../lib/eventBus'

export async function listVaults(): Promise<Vault[]> {
  return invoke<Vault[]>('list_vaults')
}

/** Create / rename / reposition a vault (upsert). */
export async function saveVault(vault: Vault): Promise<void> {
  await invoke<void>('save_vault', { vault })
  eventBus.emit('vault:changed', { id: vault.id })
}

/** Delete a vault, moving its notes into `reassignTo` (unfiled). Rust refuses to
 *  delete the last remaining vault. */
export async function deleteVault(id: string, reassignTo: string): Promise<void> {
  await invoke<void>('delete_vault', { id, reassignTo })
  eventBus.emit('vault:deleted', { id })
}

/** Move a note into a vault directly (unfiling it from any folder). */
export async function setNoteVault(noteId: string, vaultId: string): Promise<void> {
  await invoke<void>('set_note_vault', { noteId, vaultId })
  eventBus.emit('note:moved', { noteId, folderId: null, vaultId })
}

/** Factory for a new vault row. */
export function createVault(name = 'New Vault'): Vault {
  const now = Date.now()
  return { id: crypto.randomUUID(), name, position: now, createdAt: now, updatedAt: now }
}
