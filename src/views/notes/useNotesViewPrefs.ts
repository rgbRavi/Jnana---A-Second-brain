// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Persistent Notes-view preferences: display mode, sort, and active filters.
// Keyed by an instance id so independent surfaces (the All-Notes view vs. a
// workspace's notes tab) keep separate prefs instead of bleeding into each other.
// Module-level store backed by localStorage + useSyncExternalStore — same pattern
// as useComposerOptions / useSidebarPrefs.

import { useSyncExternalStore } from 'react'
import {
  EMPTY_FILTER,
  type DisplayMode,
  type NotesFilter,
  type SortBy,
  type SortOrder,
} from './filterNotes'

export interface NotesViewPrefs {
  displayMode: DisplayMode
  sortBy: SortBy
  sortOrder: SortOrder
  filters: NotesFilter
}

/** The default instance key — the global All-Notes view. */
export const NOTES_PREFS_KEY = 'notes'

const STORAGE_PREFIX = 'jnana.notes.viewprefs'
const DEFAULTS: NotesViewPrefs = {
  displayMode: 'card',
  sortBy: 'updated',
  sortOrder: 'desc',
  filters: { ...EMPTY_FILTER },
}

const stores = new Map<string, NotesViewPrefs>()
const listeners = new Map<string, Set<() => void>>()

const storageKey = (key: string) => `${STORAGE_PREFIX}:${key}`

function load(key: string): NotesViewPrefs {
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<NotesViewPrefs>
    return {
      ...DEFAULTS,
      ...parsed,
      filters: { ...EMPTY_FILTER, ...(parsed.filters ?? {}) },
    }
  } catch {
    return DEFAULTS
  }
}

function get(key: string): NotesViewPrefs {
  let cur = stores.get(key)
  if (!cur) {
    cur = load(key)
    stores.set(key, cur)
  }
  return cur
}

function commit(key: string, next: NotesViewPrefs) {
  stores.set(key, next)
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  listeners.get(key)?.forEach((l) => l())
}

export function setNotesViewPrefs(key: string, patch: Partial<NotesViewPrefs>): void {
  commit(key, { ...get(key), ...patch })
}

export function setNotesFilter(key: string, patch: Partial<NotesFilter>): void {
  commit(key, { ...get(key), filters: { ...get(key).filters, ...patch } })
}

export function resetNotesFilter(key: string): void {
  commit(key, { ...get(key), filters: { ...EMPTY_FILTER } })
}

function subscribe(key: string, listener: () => void): () => void {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(listener)
  return () => {
    set!.delete(listener)
  }
}

export function useNotesViewPrefs(key: string = NOTES_PREFS_KEY): NotesViewPrefs {
  return useSyncExternalStore(
    (l) => subscribe(key, l),
    () => get(key),
    () => get(key),
  )
}

/** How many filter dimensions are active — for a toolbar badge. */
export function activeFilterCount(f: NotesFilter): number {
  let n = 0
  if (f.datePreset !== 'all') n++
  if (f.sizes.length) n++
  if (f.includeTags.length) n++
  if (f.excludeTags.length) n++
  if (f.status.length) n++
  return n
}
