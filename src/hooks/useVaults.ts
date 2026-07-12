// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Vaults data + active-vault selection.
//   1. `useVaults()` — loads the vault list, refreshing on any vault:* event
//      (like useWorkspaces / useFolders).
//   2. `useActiveVaultId()` — a persisted module store (localStorage +
//      useSyncExternalStore) for which vault the explorer + notes views are
//      scoped to. Falls back to the default vault if the stored one is gone.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { listVaults } from '../core/vaults'
import { eventBus } from '../lib/eventBus'
import { log } from '../lib/logger'
import { DEFAULT_VAULT_ID, type Vault } from '../types'

/** Loads the vault list, refreshing on create/rename/delete. */
export function useVaults() {
  const [vaults, setVaults] = useState<Vault[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setVaults(await listVaults())
    } catch (e) {
      log.error('Failed to load vaults', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const events = ['vault:changed', 'vault:deleted'] as const
    events.forEach((e) => eventBus.on(e, refresh))
    return () => events.forEach((e) => eventBus.off(e, refresh))
  }, [refresh])

  return { vaults, loading, refresh }
}

// ─── Active vault (persisted module store) ──────────────

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

/** Non-reactive read — for the composer's auto-assign-on-create. */
export function getActiveVaultId(): string {
  return activeVaultId
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => activeVaultId

/** Reactive read of the active vault id. */
export function useActiveVaultId(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
