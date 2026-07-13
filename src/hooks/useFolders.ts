// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The virtual folder tree (single global "vault"). Loads the flat folder list
// (refreshing on any folder:* event) and exposes helpers to build the adjacency
// tree and to persist per-folder expanded/collapsed state. Two concerns:
//   1. `useFolders()` — the data (list + refresh), like useWorkspaces.
//   2. `useFolderExpansion()` — a persisted module store (localStorage +
//      useSyncExternalStore), same pattern as useSidebarPrefs / dashboard prefs.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { listFolders } from '../core/folders'
import { eventBus } from '../lib/eventBus'
import { log } from '../lib/logger'
import type { Folder } from '../types'

/** A folder plus its resolved children — the built tree the sidebar renders. */
export interface FolderNode extends Folder {
  children: FolderNode[]
}

/** Build the adjacency tree from a flat list. Roots = `parentId === null` (or a
 *  dangling parent, defensively). Siblings preserve the incoming order, which
 *  `list_folders` already sorts by (position, name). */
export function buildFolderTree(folders: Folder[]): FolderNode[] {
  const byId = new Map<string, FolderNode>()
  for (const f of folders) byId.set(f.id, { ...f, children: [] })

  const roots: FolderNode[] = []
  for (const f of folders) {
    const node = byId.get(f.id)!
    const parent = f.parentId ? byId.get(f.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** All descendant folder ids of `id` (excluding `id` itself), via the flat list.
 *  Used by the "delete folder + notes" path to collect every affected folder. */
export function descendantFolderIds(folders: Folder[], id: string): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const f of folders) {
    if (!f.parentId) continue
    const arr = childrenOf.get(f.parentId) ?? []
    arr.push(f.id)
    childrenOf.set(f.parentId, arr)
  }
  const out: string[] = []
  const stack = [...(childrenOf.get(id) ?? [])]
  while (stack.length) {
    const cur = stack.pop()!
    out.push(cur)
    stack.push(...(childrenOf.get(cur) ?? []))
  }
  return out
}

/** Loads the folder list, refreshing on any folder mutation event. */
export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setFolders(await listFolders())
    } catch (e) {
      log.error('Failed to load folders', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const events = ['folder:changed', 'folder:deleted', 'folder:moved'] as const
    events.forEach((e) => eventBus.on(e, refresh))
    return () => events.forEach((e) => eventBus.off(e, refresh))
  }, [refresh])

  return { folders, loading, refresh }
}

// ─── Expanded-state persistence (module store) ──────────

const STORAGE_KEY = 'jnana.folders.expanded.v1'

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

let expanded = loadExpanded()
const listeners = new Set<() => void>()

function commit(next: Set<string>) {
  expanded = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

export function toggleFolderExpanded(id: string): void {
  const next = new Set(expanded)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  commit(next)
}

export function setFolderExpanded(id: string, open: boolean): void {
  if (open === expanded.has(id)) return
  const next = new Set(expanded)
  if (open) next.add(id)
  else next.delete(id)
  commit(next)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => expanded

/** Reactive read of the expanded-folder id set. */
export function useFolderExpansion(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
