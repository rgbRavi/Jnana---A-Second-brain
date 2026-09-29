// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Tab drag state — a module store (useSyncExternalStore) driving a pointer-event
// drag, NOT HTML5 drag-and-drop. The Tauri webview swallows native `draggable`/
// `onDrop`, so the whole app (Canvas, DashboardGrid, media) uses pointer events;
// tabs follow suit. The store also lets the drag ghost + drop-target highlight
// render while a drag is in flight.

import { useSyncExternalStore } from 'react'
import type { SplitSide } from './layout'

export interface TabDropTarget {
  groupId: string
  index: number
  /** Set when dropped near a pane edge: split that pane on this side instead. */
  side?: SplitSide
}

export interface TabDragState {
  noteId: string
  fromGroup: string
  title: string
  x: number // current pointer position (for the floating ghost)
  y: number
  target: TabDropTarget | null
  /** A note dragged in from outside Working Notes (the file explorer): it draws
   *  its own ghost, so only the pane highlight uses this state. */
  external?: boolean
}

let state: TabDragState | null = null
const listeners = new Set<() => void>()

export function getTabDrag(): TabDragState | null {
  return state
}

export function setTabDrag(next: TabDragState | null) {
  state = next
  listeners.forEach((l) => l())
}

export function useTabDrag(): TabDragState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}

/** Fraction of a pane's width/height, from each edge, that drops as a split. */
export const EDGE_ZONE = 0.25

/** Which edge zone of `rect` the point falls in (nearest edge wins), or null
 *  for the centre. Pure — drives drag-to-split. */
export function edgeSide(
  rect: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
  zone = EDGE_ZONE,
): SplitSide | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  const fx = (x - rect.left) / rect.width
  const fy = (y - rect.top) / rect.height
  const distances: [SplitSide, number][] = [
    ['left', fx],
    ['right', 1 - fx],
    ['above', fy],
    ['below', 1 - fy],
  ]
  const [side, dist] = distances.reduce((best, d) => (d[1] < best[1] ? d : best))
  return dist < zone ? side : null
}

/** Find the pane + insert index under a screen point (for pointermove/up).
 *  Over the tab strip → a tab position; over the pane body → a split `side`
 *  when near an edge, else append as the last tab. */
export function hitTestDrop(x: number, y: number): TabDropTarget | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  const groupEl = el?.closest('[data-group-id]') as HTMLElement | null
  if (!groupEl) return null
  const groupId = groupEl.getAttribute('data-group-id')
  if (!groupId) return null
  const tabEls = Array.from(groupEl.querySelectorAll<HTMLElement>('[data-tab]'))
  if (!el?.closest('[data-tab-strip]')) {
    const side = edgeSide(groupEl.getBoundingClientRect(), x, y)
    return side ? { groupId, index: tabEls.length, side } : { groupId, index: tabEls.length }
  }
  let index = tabEls.length
  for (let i = 0; i < tabEls.length; i++) {
    const r = tabEls[i].getBoundingClientRect()
    if (x < r.left + r.width / 2) {
      index = i
      break
    }
  }
  return { groupId, index }
}
