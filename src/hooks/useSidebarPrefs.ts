// src/hooks/useSidebarPrefs.ts
//
// Persistent UI preferences for the left navigation rail. A module-level store
// backed by localStorage (survives reloads) and read reactively via
// useSyncExternalStore — same pattern as useComposerOptions / lib/toast.

import { useSyncExternalStore } from 'react'

export interface SidebarPrefs {
  /** When true the rail is icon-only (labels hidden, shown as tooltips). */
  collapsed: boolean
}

const STORAGE_KEY = 'jnana.sidebar.prefs'
const DEFAULTS: SidebarPrefs = { collapsed: false }

function load(): SidebarPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SidebarPrefs>) }
  } catch {
    return DEFAULTS
  }
}

let prefs: SidebarPrefs = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
}

export function setSidebarPrefs(patch: Partial<SidebarPrefs>): void {
  prefs = { ...prefs, ...patch }
  persist()
  listeners.forEach((l) => l())
}

export function toggleSidebarCollapsed(): void {
  setSidebarPrefs({ collapsed: !prefs.collapsed })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => prefs

export function useSidebarPrefs(): SidebarPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
