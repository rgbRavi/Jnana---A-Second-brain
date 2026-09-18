// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Bridge between the focused Working Notes EditorPane and the right-rail
// "Note tools" panel (ui/rail/NoteToolsPanel.tsx) — same pattern as
// activeTable.ts. The pane publishes its tag/suggestion/media/format context
// here; whichever pane was pressed or focused last owns it, and a pane clears
// itself on unmount (via a token so a stale pane can't clear a newer owner).

import { useSyncExternalStore, type RefObject } from 'react'
import type { Note } from '../types'
import type { LiveEditorHandle } from '../ui/editor/LiveEditor'
import type { ComposerToolbarProps } from '../hooks/useComposer'

export interface ActiveNoteState {
  /** The live draft (title/content/tags as currently typed). */
  note: Note
  allNotes: Note[]
  /** Replace the user tags (auto tags are kept by the pane). */
  setUserTags(userTags: string[]): void
  addTag(tag: string): void
  addLink(title: string): void
  /** Typed (JSON-content) note — no prose suggestions, no markdown toolbars. */
  typed: boolean
  /** Markdown editor is mounted (edit mode, untyped) — media + format apply. */
  editing: boolean
  editorRef: RefObject<LiveEditorHandle | null>
  toolbarProps: ComposerToolbarProps
  uploading: boolean
}

let state: ActiveNoteState | null = null
let token: object | null = null
const listeners = new Set<() => void>()

export function setActiveNote(next: ActiveNoteState, tok: object): void {
  token = tok
  state = next
  listeners.forEach((l) => l())
}

export function clearActiveNote(tok: object): void {
  if (token !== tok) return
  token = null
  state = null
  listeners.forEach((l) => l())
}

/** True when `tok` owns the store, or nobody does (first pane claims it). */
export function mayPublishActiveNote(tok: object): boolean {
  return token === null || token === tok
}

export function useActiveNote(): ActiveNoteState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}
