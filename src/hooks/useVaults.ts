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
import { subscribeActiveVault, getActiveVaultSnapshot } from '../lib/activeVault'
import { log } from '../lib/logger'
import { type Vault } from '../types'

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

// ─── Active vault ───────────────────────────────────────
// The store itself lives in lib/activeVault.ts (core/ reads it too — the plugin
// notes API scopes to the active vault). Re-exported here so callers keep their
// existing import.

export { setActiveVaultId, getActiveVaultId } from '../lib/activeVault'

/** Reactive read of the active vault id. */
export function useActiveVaultId(): string {
  return useSyncExternalStore(subscribeActiveVault, getActiveVaultSnapshot, getActiveVaultSnapshot)
}
