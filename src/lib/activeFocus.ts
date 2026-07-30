// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Tiny bridge that gates the right-rail "Focused scope" panel. The composer's
// Focused menu arms an action (in the shared `ai.free.focus` view-state) and
// calls openFocusPanel() to dock the scope editor here. The panel reads the
// armed action straight from view-state, so this store only tracks presence.
// Same module-store + useSyncExternalStore shape as lib/activeTable.ts.

import { useSyncExternalStore } from 'react'

let present = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Show the docked scope panel. */
export function openFocusPanel(): void {
  if (present) return
  present = true
  emit()
}

/** Hide the docked scope panel (after leaving the chat, or on disarm). */
export function closeFocusPanel(): void {
  if (!present) return
  present = false
  emit()
}

export function useActiveFocus(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => present,
    () => present,
  )
}
