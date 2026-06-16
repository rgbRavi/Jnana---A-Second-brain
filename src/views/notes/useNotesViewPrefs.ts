// Persistent Notes-view preferences: display mode, sort, and active filters.
// Module-level store backed by localStorage + useSyncExternalStore — same pattern
// as useComposerOptions / useSidebarPrefs (the live search box stays in
// useViewState instead, so it doesn't persist stale across restarts).

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

const STORAGE_KEY = 'jnana.notes.viewprefs'
const DEFAULTS: NotesViewPrefs = {
  displayMode: 'card',
  sortBy: 'updated',
  sortOrder: 'desc',
  filters: { ...EMPTY_FILTER },
}

function load(): NotesViewPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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

let prefs: NotesViewPrefs = load()
const listeners = new Set<() => void>()

function commit(next: NotesViewPrefs) {
  prefs = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
  listeners.forEach((l) => l())
}

export function setNotesViewPrefs(patch: Partial<NotesViewPrefs>): void {
  commit({ ...prefs, ...patch })
}

export function setNotesFilter(patch: Partial<NotesFilter>): void {
  commit({ ...prefs, filters: { ...prefs.filters, ...patch } })
}

export function resetNotesFilter(): void {
  commit({ ...prefs, filters: { ...EMPTY_FILTER } })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => prefs

export function useNotesViewPrefs(): NotesViewPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
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
