// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useNotesContext } from '../../context/NotesContext'
import { CanvasStatic } from '../../views/workspaces/canvas/CanvasStatic'
import type { NoteViewProps } from '../../lib/noteTypes'

/** Read-mode view for a canvas note — a lightweight, non-interactive preview. */
export function CanvasNoteView({ note }: NoteViewProps) {
  const { notes } = useNotesContext()
  return <CanvasStatic content={note.content} allNotes={notes} height={320} />
}
