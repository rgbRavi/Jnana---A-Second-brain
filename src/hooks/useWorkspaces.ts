// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listWorkspaces } from '../core/workspaces'
import { useActiveVaultId } from './useVaults'
import { eventBus } from '../lib/eventBus'
import { log } from '../lib/logger'
import { DEFAULT_VAULT_ID, type Workspace } from '../types'

/** Loads the workspace list, scoped to the active vault (Obsidian-style — each
 *  vault has its own workspaces), refreshing on any `workspace:changed` event. */
export function useWorkspaces() {
  const [all, setAll] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const activeVaultId = useActiveVaultId()

  const refresh = useCallback(async () => {
    try {
      setAll(await listWorkspaces())
    } catch (e) {
      log.error('Failed to load workspaces', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    eventBus.on('workspace:changed', refresh)
    return () => eventBus.off('workspace:changed', refresh)
  }, [refresh])

  const workspaces = useMemo(
    () => all.filter((w) => (w.vaultId ?? DEFAULT_VAULT_ID) === activeVaultId),
    [all, activeVaultId],
  )

  // `allWorkspaces` (every vault) is for resolving cross-vault references —
  // the sidebar's pinned/open shortcuts and looking a workspace up by id when
  // opening it from another vault. `workspaces` (scoped) is for lists.
  return { workspaces, allWorkspaces: all, loading, refresh }
}
