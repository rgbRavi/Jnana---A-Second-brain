// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Active-workspace preferences: which workspace is "current" (drives quick-note
// capture + AI scope) and which workspaces are pinned in the sidebar. Persisted
// module store (localStorage + useSyncExternalStore), same pattern as
// useSidebarPrefs.

import { useSyncExternalStore } from 'react'

export interface ActiveWorkspaceState {
  activeWorkspaceId: string | null
  pinnedWorkspaceIds: string[]
  /** Workspaces the user has opened this session/run — shown in the sidebar's
   *  collapsible "Open workspaces" section until explicitly closed (×). */
  openWorkspaceIds: string[]
}

const STORAGE_KEY = 'jnana.workspace.active'
const DEFAULTS: ActiveWorkspaceState = { activeWorkspaceId: null, pinnedWorkspaceIds: [], openWorkspaceIds: [] }

function load(): ActiveWorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ActiveWorkspaceState>) }
  } catch {
    return DEFAULTS
  }
}

let state: ActiveWorkspaceState = load()
const listeners = new Set<() => void>()

function commit(next: ActiveWorkspaceState) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

export function setActiveWorkspace(id: string | null): void {
  if (id === state.activeWorkspaceId) return
  commit({ ...state, activeWorkspaceId: id })
}

export function togglePinnedWorkspace(id: string): void {
  const has = state.pinnedWorkspaceIds.includes(id)
  commit({
    ...state,
    pinnedWorkspaceIds: has
      ? state.pinnedWorkspaceIds.filter((x) => x !== id)
      : [...state.pinnedWorkspaceIds, id],
  })
}

/** Add a workspace to the "open" list (no-op if already there). Called on visit. */
export function openWorkspace(id: string): void {
  if (!id || state.openWorkspaceIds.includes(id)) return
  commit({ ...state, openWorkspaceIds: [...state.openWorkspaceIds, id] })
}

/** Remove a workspace from the "open" list (the sidebar ×, or the in-view Close). */
export function closeWorkspace(id: string): void {
  if (!state.openWorkspaceIds.includes(id)) return
  commit({ ...state, openWorkspaceIds: state.openWorkspaceIds.filter((x) => x !== id) })
}

/** Non-reactive read — for the composer's auto-add-on-save. */
export function getActiveWorkspaceId(): string | null {
  return state.activeWorkspaceId
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => state

export function useActiveWorkspace(): ActiveWorkspaceState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
