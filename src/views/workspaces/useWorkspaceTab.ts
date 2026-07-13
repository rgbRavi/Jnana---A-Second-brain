// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useSyncExternalStore } from 'react'

export type WorkspaceTab = 'dashboard' | 'notes' | 'graph' | 'canvas' | 'insights'

const KEY = 'jnana.workspace.tabs.v1'
const VALID: readonly WorkspaceTab[] = ['dashboard', 'notes', 'graph', 'canvas', 'insights']

/**
 * The active tab of each workspace, **keyed by workspace id** and **persisted to
 * localStorage** — mirrors the module-store + `useSyncExternalStore` + localStorage
 * pattern used by `useNotesViewPrefs`/`useComposerOptions`. This replaces the old
 * `useViewState('workspace.tab', …)` which was in-memory only (lost on reload) and
 * used a single shared key (so every workspace showed the same tab), which read as
 * "the workspace view doesn't remember where I was".
 */
function load(): Record<string, WorkspaceTab> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, WorkspaceTab>) : {}
  } catch {
    return {}
  }
}

let map = load()
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Store (and persist) a workspace's active tab, notifying subscribers. */
export function setWorkspaceTab(id: string, tab: WorkspaceTab): void {
  if (!id || map[id] === tab) return
  map = { ...map, [id]: tab }
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / private-mode failures — in-memory value still updates */
  }
  emit()
}

/** The remembered tab for a workspace, defaulting to `dashboard`. */
export function useWorkspaceTab(id: string): WorkspaceTab {
  const get = useCallback(() => {
    const t = map[id]
    return t && VALID.includes(t) ? t : 'dashboard'
  }, [id])
  return useSyncExternalStore(subscribe, get, get)
}
