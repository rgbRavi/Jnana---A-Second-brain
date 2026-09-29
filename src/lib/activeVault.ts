// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The active vault, as a plain module store (+ localStorage mirror). It lives in
// lib/ rather than hooks/ because `core/` needs to read it — the plugin notes API
// scopes to the active vault, and `core/` must stay usable without a React tree.
// `hooks/useVaults.ts` re-exports these and adds the reactive hook.

import { DEFAULT_VAULT_ID } from '../types'

const STORAGE_KEY = 'jnana.vault.active.v1'

function load(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_VAULT_ID
  } catch {
    return DEFAULT_VAULT_ID
  }
}

let activeVaultId = load()
const listeners = new Set<() => void>()

export function setActiveVaultId(id: string): void {
  if (id === activeVaultId) return
  activeVaultId = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

/** Non-reactive read — for the composer's auto-assign-on-create, and for `core/`. */
export function getActiveVaultId(): string {
  return activeVaultId
}

export function subscribeActiveVault(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Stable snapshot for useSyncExternalStore. */
export function getActiveVaultSnapshot(): string {
  return activeVaultId
}

/** True when a note belongs to the vault (an absent `vaultId` means the default). */
export function noteInVault(note: { vaultId?: string | null }, vaultId: string): boolean {
  return (note.vaultId ?? DEFAULT_VAULT_ID) === vaultId
}
