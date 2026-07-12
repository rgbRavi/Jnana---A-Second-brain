// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/hooks/useProjects.ts
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listProjects } from '../core/aiWorkspace'
import { useActiveVaultId } from './useVaults'
import { DEFAULT_VAULT_ID, type AiProject } from '../types'

/** Loads the AI projects list, scoped to the active vault (each vault has its own
 *  projects). Refreshable after edits. */
export function useProjects() {
  const [all, setAll] = useState<AiProject[]>([])
  const activeVaultId = useActiveVaultId()

  const refresh = useCallback(async () => {
    try {
      setAll(await listProjects())
    } catch (e) {
      console.error('Failed to load projects:', e)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const projects = useMemo(
    () => all.filter((p) => (p.vaultId ?? DEFAULT_VAULT_ID) === activeVaultId),
    [all, activeVaultId],
  )

  return { projects, refresh }
}
