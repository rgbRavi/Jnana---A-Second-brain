// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// First-party bundled plugin: a freeform canvas as a note type. The board is
// stored as a serialized CanvasDoc in the note's content, so a canvas rides
// folders/vaults/graph/search/export/trash like any note, and can be created
// anywhere a note can. Mirrors the flashcards note-type reference.

import { Frame } from 'lucide-react'
import type { Plugin } from '../../types'
import { EMPTY_CANVAS_CONTENT, canvasToSearchText, canvasToExportMarkdown } from './canvasNote'
import { CanvasNoteEditor } from './CanvasNoteEditor'
import { CanvasNoteView } from './CanvasNoteView'

export const CANVAS_PLUGIN_ID = 'jnana.canvas'

/** The note-type id a canvas note carries in `note.kind`. */
export const CANVAS_NOTE_KIND = 'canvas'

export const canvasPlugin: Plugin = {
  id: CANVAS_PLUGIN_ID,
  name: 'Canvas',
  version: '1.0.0',
  init(ctx) {
    ctx.registerNoteType({
      id: CANVAS_NOTE_KIND,
      label: 'Canvas',
      icon: Frame,
      View: CanvasNoteView,
      Editor: CanvasNoteEditor,
      newContent: () => EMPTY_CANVAS_CONTENT,
      toSearchText: (note) => canvasToSearchText(note.content),
      toExportMarkdown: (note) => canvasToExportMarkdown(note.content),
    })
  },
}
