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

export type NotesSubView = 'gallery' | 'working'

const LAYOUT_KEY = 'jnana.working.layout.v1'
const SUBVIEW_KEY = 'jnana.notes.subview.v1'

// ---- layout store ---------------------------------------------------------

function loadLayout(): WorkingLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return EMPTY_LAYOUT
    const parsed = JSON.parse(raw) as WorkingLayout
    // Trust the shape loosely — reconcile() (run once notes load) repairs it.
    if (parsed && typeof parsed === 'object' && 'root' in parsed) return parsed
    return EMPTY_LAYOUT
  } catch {
    return EMPTY_LAYOUT
  }
}

let layout: WorkingLayout = loadLayout()
const layoutListeners = new Set<() => void>()

function commitLayout(next: WorkingLayout) {
  if (next === layout) return
  layout = next
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  layoutListeners.forEach((l) => l())
}

export function getWorkingLayout(): WorkingLayout {
  return layout
}

export function useWorkingLayout(): WorkingLayout {
  return useSyncExternalStore(
    (l) => {
      layoutListeners.add(l)
      return () => layoutListeners.delete(l)
    },
    () => layout,
    () => layout,
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

/** Open a note as a tab and switch the Notes view to Working Notes. Callers on
 *  other routes should also navigate('/notes'). */
export function openNoteInWorking(noteId: string) {
  commitLayout(openNote(layout, noteId))
  setNotesSubView('working')
}

export function closeWorkingTab(noteId: string, groupId?: string) {
  commitLayout(closeTab(layout, noteId, groupId))
}

export function splitWorkingGroup(groupId: string, dir: 'row' | 'col', moveNoteId?: string) {
  commitLayout(splitGroup(layout, groupId, dir, moveNoteId))
}

export function closeWorkingGroup(groupId: string) {
  commitLayout(closeGroup(layout, groupId))
}

export function moveWorkingTab(noteId: string, toGroupId: string, index: number) {
  commitLayout(moveTab(layout, noteId, toGroupId, index))
}

export function setWorkingActiveTab(groupId: string, noteId: string) {
  commitLayout(setActiveTab(layout, groupId, noteId))
}

export function setWorkingActiveGroup(groupId: string) {
  commitLayout(setActiveGroup(layout, groupId))
}

export function setWorkingSplitSizes(splitId: string, sizes: number[]) {
  commitLayout(setSplitSizes(layout, splitId, sizes))
}

/** Drop tabs whose notes no longer exist. Called once notes load / on delete. */
export function reconcileWorking(existingIds: Set<string>) {
  commitLayout(reconcile(layout, existingIds))
}
