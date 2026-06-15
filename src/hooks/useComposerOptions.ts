// src/hooks/useComposerOptions.ts
//
// Persistent UI preferences for the floating note composer. A module-level store
// backed by localStorage (so it survives reloads, unlike useViewState) and read
// reactively via useSyncExternalStore — same pattern as lib/toast & lib/dialog —
// so the Settings panel and the live composer stay in sync.

import { useSyncExternalStore } from 'react'

export interface ComposerOptions {
  /** How see-through the collapsed pill is: 0 = solid, 100 = fully transparent. */
  transparency: number
  /** Frosted-glass blur behind the collapsed pill. */
  glass: boolean
  /** Reopen the composer in its last expanded/collapsed state after a reload. */
  rememberState: boolean
}

const STORAGE_KEY = 'jnana.composer.options'
const DEFAULTS: ComposerOptions = { transparency: 35, glass: true, rememberState: true }

function load(): ComposerOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ComposerOptions>) }
  } catch {
    return DEFAULTS
  }
}

let options: ComposerOptions = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
}

export function setComposerOptions(patch: Partial<ComposerOptions>): void {
  options = { ...options, ...patch }
  persist()
  listeners.forEach((l) => l())
}

/** Non-reactive read (for the composer's one-time state seeding). */
export function getComposerOptions(): ComposerOptions {
  return options
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => options

export function useComposerOptions(): [ComposerOptions, (patch: Partial<ComposerOptions>) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return [value, setComposerOptions]
}
