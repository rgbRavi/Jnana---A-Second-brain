// Active-workspace preferences: which workspace is "current" (drives quick-note
// capture + AI scope) and which workspaces are pinned in the sidebar. Persisted
// module store (localStorage + useSyncExternalStore), same pattern as
// useSidebarPrefs.

import { useSyncExternalStore } from 'react'

export interface ActiveWorkspaceState {
  activeWorkspaceId: string | null
  pinnedWorkspaceIds: string[]
}

const STORAGE_KEY = 'jnana.workspace.active'
const DEFAULTS: ActiveWorkspaceState = { activeWorkspaceId: null, pinnedWorkspaceIds: [] }

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
