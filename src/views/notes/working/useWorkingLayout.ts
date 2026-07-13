// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Working Notes — the module store behind the tabbed/split editor.
//
// Mirrors the useComposerOptions / useNotesViewPrefs pattern: a module-level
// value + useSyncExternalStore + localStorage. The layout (a pure tree from
// layout.ts) and the active Notes sub-view ('gallery' | 'working') persist so
// tabs and splits restore on launch. Imperative helpers let non-React callers
// (the note:navigate handler, gallery cards, the peek modal) drive the store.

import { useSyncExternalStore } from 'react'
import {
  EMPTY_LAYOUT,
  openNote,
  closeTab,
  splitGroup,
  closeGroup,
  moveTab,
  setActiveTab,
  setActiveGroup,
  setSplitSizes,
  reconcile,
  type WorkingLayout,
} from './layout'
import { getActiveVaultId, setActiveVaultId, useActiveVaultId } from '../../../hooks/useVaults'
import { DEFAULT_VAULT_ID } from '../../../types'

export type NotesSubView = 'gallery' | 'working'

const LAYOUT_KEY = 'jnana.working.layout.v2'
const OLD_LAYOUT_KEY = 'jnana.working.layout.v1'
const SUBVIEW_KEY = 'jnana.notes.subview.v1'

// ---- layout store (per-vault) ---------------------------------------------
//
// Working Notes is scoped to the active vault — each vault keeps its own open
// tabs + splits (Obsidian-style), so switching vaults swaps the desk. The store
// holds one WorkingLayout per vault id; every mutator targets the active vault.

type LayoutMap = Record<string, WorkingLayout>

function isLayout(v: unknown): v is WorkingLayout {
  return !!v && typeof v === 'object' && 'root' in (v as object)
}

function loadLayouts(): LayoutMap {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as LayoutMap
      if (parsed && typeof parsed === 'object') return parsed
    }
    // Migrate the old single-layout store into the default vault's slot.
    const old = localStorage.getItem(OLD_LAYOUT_KEY)
    if (old) {
      const parsed = JSON.parse(old)
      if (isLayout(parsed)) return { [DEFAULT_VAULT_ID]: parsed }
    }
  } catch {
    /* fall through to empty */
  }
  return {}
}

let layouts: LayoutMap = loadLayouts()
const layoutListeners = new Set<() => void>()

function layoutFor(vaultId: string): WorkingLayout {
  return layouts[vaultId] ?? EMPTY_LAYOUT
}

function persistLayouts() {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layouts))
  } catch {
    /* storage unavailable */
  }
}

/** Commit a new layout for a specific vault. */
function commitLayoutFor(vaultId: string, next: WorkingLayout) {
  if (next === layoutFor(vaultId)) return
  layouts = { ...layouts, [vaultId]: next }
  persistLayouts()
  layoutListeners.forEach((l) => l())
}

/** Commit a new layout for the *active* vault (the common case). */
function commitLayout(next: WorkingLayout) {
  commitLayoutFor(getActiveVaultId(), next)
}

export function getWorkingLayout(): WorkingLayout {
  return layoutFor(getActiveVaultId())
}

export function useWorkingLayout(): WorkingLayout {
  // Reading the active vault here makes the desk re-render (and re-read the
  // right slot) whenever the vault switches, not just on a layout mutation.
  const vaultId = useActiveVaultId()
  return useSyncExternalStore(
    (l) => {
      layoutListeners.add(l)
      return () => layoutListeners.delete(l)
    },
    () => layoutFor(vaultId),
    () => layoutFor(vaultId),
  )
}

// ---- sub-view store -------------------------------------------------------

function loadSubView(): NotesSubView {
  try {
    return localStorage.getItem(SUBVIEW_KEY) === 'working' ? 'working' : 'gallery'
  } catch {
    return 'gallery'
  }
}

let subView: NotesSubView = loadSubView()
const subViewListeners = new Set<() => void>()

export function setNotesSubView(v: NotesSubView) {
  if (v === subView) return
  subView = v
  try {
    localStorage.setItem(SUBVIEW_KEY, v)
  } catch {
    /* storage unavailable */
  }
  subViewListeners.forEach((l) => l())
}

export function getNotesSubView(): NotesSubView {
  return subView
}

export function useNotesSubView(): NotesSubView {
  return useSyncExternalStore(
    (l) => {
      subViewListeners.add(l)
      return () => subViewListeners.delete(l)
    },
    () => subView,
    () => subView,
  )
}

// ---- imperative mutators (thin wrappers over pure ops) --------------------

/** Open a note as a tab and switch the Notes view to Working Notes. When the
 *  note's vault is known and differs from the active one, switch to it first so
 *  the note lands in its own vault's desk (and the explorer/gallery follow).
 *  Callers on other routes should also navigate('/notes'). */
export function openNoteInWorking(noteId: string, vaultId?: string) {
  if (vaultId && vaultId !== getActiveVaultId()) setActiveVaultId(vaultId)
  commitLayout(openNote(getWorkingLayout(), noteId))
  setNotesSubView('working')
}

export function closeWorkingTab(noteId: string, groupId?: string) {
  commitLayout(closeTab(getWorkingLayout(), noteId, groupId))
}

export function splitWorkingGroup(groupId: string, dir: 'row' | 'col', moveNoteId?: string) {
  commitLayout(splitGroup(getWorkingLayout(), groupId, dir, moveNoteId))
}

export function closeWorkingGroup(groupId: string) {
  commitLayout(closeGroup(getWorkingLayout(), groupId))
}

export function moveWorkingTab(noteId: string, toGroupId: string, index: number) {
  commitLayout(moveTab(getWorkingLayout(), noteId, toGroupId, index))
}

export function setWorkingActiveTab(groupId: string, noteId: string) {
  commitLayout(setActiveTab(getWorkingLayout(), groupId, noteId))
}

export function setWorkingActiveGroup(groupId: string) {
  commitLayout(setActiveGroup(getWorkingLayout(), groupId))
}

export function setWorkingSplitSizes(splitId: string, sizes: number[]) {
  commitLayout(setSplitSizes(getWorkingLayout(), splitId, sizes))
}

/** Drop tabs whose notes aren't in `existingIds` (the active vault's notes) —
 *  called once notes load, on delete, and on vault switch. Reconciles only the
 *  active vault's desk. */
export function reconcileWorking(existingIds: Set<string>) {
  commitLayout(reconcile(getWorkingLayout(), existingIds))
}
