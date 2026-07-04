// Tab drag state — a module store (useSyncExternalStore) driving a pointer-event
// drag, NOT HTML5 drag-and-drop. The Tauri webview swallows native `draggable`/
// `onDrop`, so the whole app (Canvas, DashboardGrid, media) uses pointer events;
// tabs follow suit. The store also lets the drag ghost + drop-target highlight
// render while a drag is in flight.

import { useSyncExternalStore } from 'react'

export interface TabDropTarget {
  groupId: string
  index: number
}

export interface TabDragState {
  noteId: string
  fromGroup: string
  title: string
  x: number // current pointer position (for the floating ghost)
  y: number
  target: TabDropTarget | null
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

/** Find the pane + insert index under a screen point (for pointermove/up). */
export function hitTestDrop(x: number, y: number): TabDropTarget | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  const groupEl = el?.closest('[data-group-id]') as HTMLElement | null
  if (!groupEl) return null
  const groupId = groupEl.getAttribute('data-group-id')
  if (!groupId) return null
  const tabEls = Array.from(groupEl.querySelectorAll<HTMLElement>('[data-tab]'))
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
