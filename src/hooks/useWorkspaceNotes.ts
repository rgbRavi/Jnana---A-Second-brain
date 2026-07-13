// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNotesContext } from '../context/NotesContext'
import { useActiveVaultId } from './useVaults'
import { eventBus } from '../lib/eventBus'
import { log } from '../lib/logger'
import {
  addWorkspaceNotes,
  listWorkspaceNotes,
  removeWorkspaceNote,
  setWorkspaceNotePinned,
} from '../core/workspaces'
import { DEFAULT_VAULT_ID, type WorkspaceNote } from '../types'

/**
 * A workspace's notes, derived by intersecting the global notes (from
 * NotesContext) with the workspace's membership rows — so notes stay global and
 * edits made anywhere flow through. Refreshes when membership changes, when a
 * note is saved (it may have been auto-added on create) or deleted.
 */
export function useWorkspaceNotes(workspaceId: string) {
  const { notes: allNotes } = useNotesContext()
  const activeVaultId = useActiveVaultId()
  const [members, setMembers] = useState<WorkspaceNote[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setMembers(await listWorkspaceNotes(workspaceId))
    } catch (e) {
      log.error('Failed to load workspace notes', e)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
    eventBus.on('workspace:changed', refresh)
    eventBus.on('note:saved', refresh)
    eventBus.on('note:deleted', refresh)
    return () => {
      eventBus.off('workspace:changed', refresh)
      eventBus.off('note:saved', refresh)
      eventBus.off('note:deleted', refresh)
    }
  }, [refresh])

  const memberMap = useMemo(() => new Map(members.map((m) => [m.noteId, m])), [members])
  // Scoped to the active vault: a workspace's notes shown are its members that
  // also live in the current vault (membership is global; the vault is a lens).
  const notes = useMemo(
    () =>
      allNotes.filter(
        (n) => memberMap.has(n.id) && (n.vaultId ?? DEFAULT_VAULT_ID) === activeVaultId,
      ),
    [allNotes, memberMap, activeVaultId],
  )
  const pinnedIds = useMemo(
    () => new Set(members.filter((m) => m.pinned).map((m) => m.noteId)),
    [members],
  )

  const addNotes = useCallback((ids: string[]) => addWorkspaceNotes(workspaceId, ids), [workspaceId])
  const removeNote = useCallback((id: string) => removeWorkspaceNote(workspaceId, id), [workspaceId])
  const togglePin = useCallback(
    (id: string) => setWorkspaceNotePinned(workspaceId, id, !(memberMap.get(id)?.pinned ?? false)),
    [workspaceId, memberMap],
  )

  return { notes, pinnedIds, loading, refresh, addNotes, removeNote, togglePin }
}
