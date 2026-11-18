// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Saved graph views: named snapshots of filters, groups, display prefs, forces
// and camera. Module store + localStorage (same pattern as useGraphForces).
// Views are global (shared across vaults), not per vault.

import { useSyncExternalStore } from 'react'
import type { GraphForces } from '../../hooks/useGraphForces'

/** Plain-JSON snapshot. Every field is optional on apply so older/newer shapes load. */
export interface GraphViewSnapshot {
  filterText?: string
  filterTags?: string[]
  datePreset?: string
  orphansOnly?: boolean
  /** Stored as-is; GraphView reads groups through its own migration. */
  groups?: unknown
  neighbourhoodOnly?: boolean
  directed?: boolean
  highlightStructure?: boolean
  pinOnDrag?: boolean
  colorBy?: 'groups' | 'clusters'
  textFade?: number
  nodeSize?: number
  linkThickness?: number
  forces?: Partial<GraphForces>
  camera?: { k: number; x: number; y: number } | null
  [extra: string]: unknown
}

export interface SavedView {
  id: string
  name: string
  createdAt: number
  state: GraphViewSnapshot
}

const STORAGE_KEY = 'jnana.graph.views'

function load(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v)
      ? v.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && x.state && typeof x.state === 'object')
      : []
  } catch {
    return []
  }
}

let views: SavedView[] = load()
const listeners = new Set<() => void>()

function commit(next: SavedView[]): void {
  views = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views))
  } catch {
    /* storage unavailable — keep in memory */
  }
  listeners.forEach((l) => l())
}

export const getSavedViews = () => views

/** Re-read storage (tests). */
export function reloadSavedViews(): void {
  views = load()
  listeners.forEach((l) => l())
}

/** Saves under `name`; a same-named view (case-insensitive) is overwritten in place. */
export function saveView(name: string, state: GraphViewSnapshot): SavedView {
  const n = name.trim()
  const existing = views.find((v) => v.name.toLowerCase() === n.toLowerCase())
  if (existing) {
    const updated = { ...existing, state }
    commit(views.map((v) => (v.id === existing.id ? updated : v)))
    return updated
  }
  const view: SavedView = { id: crypto.randomUUID(), name: n, createdAt: Date.now(), state }
  commit([...views, view])
  return view
}

export function renameView(id: string, name: string): void {
  commit(views.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)))
}

export function deleteView(id: string): void {
  commit(views.filter((v) => v.id !== id))
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useSavedViews(): SavedView[] {
  return useSyncExternalStore(subscribe, getSavedViews, getSavedViews)
}
