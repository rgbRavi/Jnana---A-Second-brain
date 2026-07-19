// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Bridge between the focused inline table editor (EditorTableWidget in
// NoteEmbeds.tsx) and the right-rail Table panel (ui/rail/TableToolPanel.tsx).
// The table lives inside a CodeMirror widget with its own local state, so the
// out-of-tree toolbar can't reach in directly — instead the focused widget
// *publishes* its dims + active cell + a set of action callbacks (bound to its
// own refs) here, and the panel reads them. Same module-store + useSyncExternalStore
// pattern as lib/toast.ts. Focus-driven: whichever table cell was focused last
// is the target; a widget clears itself on unmount (via a token so a stale
// widget can't clear a newer active one).

import { useSyncExternalStore } from 'react'

export interface ActiveTableActions {
  sortColumn(dir: 'asc' | 'desc'): void
  moveRow(dir: 'up' | 'down'): void
  moveColumn(dir: 'left' | 'right'): void
  insertRow(where: 'above' | 'below'): void
  insertColumn(where: 'left' | 'right'): void
  deleteRow(): void
  deleteColumn(): void
  transpose(): void
  /** Set the active column's alignment (`l`/`c`/`r`, toggled off back to default). */
  alignColumn(code: 'l' | 'c' | 'r'): void
  toggleNoHeader(): void
  toggleZebra(): void
  /** Set the active column's footer aggregate (`s`/`a`/`c`/`n`/`x`, toggled off). */
  setAggregate(code: 's' | 'a' | 'c' | 'n' | 'x'): void
  exportCsv(): void
  copyCsv(): void
}

export interface ActiveTableState {
  present: boolean
  rows: number
  cols: number
  /** The focused cell (row/col) — the target for column/row-relative actions. */
  activeCell: { r: number; c: number } | null
  /** Per-column alignment codes of the active table (for the panel's toggle state). */
  align: string
  /** Format flags + per-column aggregate codes (for the panel's toggle state). */
  noHeader: boolean
  zebra: boolean
  agg: string
  actions: ActiveTableActions | null
}

const EMPTY: ActiveTableState = { present: false, rows: 0, cols: 0, activeCell: null, align: '', noHeader: false, zebra: false, agg: '', actions: null }

let state: ActiveTableState = EMPTY
let token: object | null = null
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

/** Publish the focused table's context. `tok` identifies the owning widget. */
export function setActiveTable(next: Omit<ActiveTableState, 'present'>, tok: object): void {
  token = tok
  state = { ...next, present: true }
  emit()
}

/** Clear only if `tok` still owns the active table (guards unmount races). */
export function clearActiveTable(tok: object): void {
  if (token !== tok) return
  token = null
  state = EMPTY
  emit()
}

export function getActiveTable(): ActiveTableState {
  return state
}

export function useActiveTable(): ActiveTableState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}
