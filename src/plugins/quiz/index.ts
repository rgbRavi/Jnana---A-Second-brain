// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// First-party bundled plugin: a saved quiz as a note type. The attempt is
// stored as JSON in the note's content, so a quiz rides folders/vaults/search/
// export/trash like any note. Mirrors the canvas note type.

import { GraduationCap } from 'lucide-react'
import type { Plugin } from '../../types'
import { EMPTY_QUIZ_CONTENT, quizToExportMarkdown, quizToSearchText } from './quizNote'
import { QuizNoteEditor, QuizNoteView } from './QuizNoteView'

export const QUIZ_PLUGIN_ID = 'jnana.quiz'

/** The note-type id a saved quiz carries in `note.kind`. */
export const QUIZ_NOTE_KIND = 'quiz'

export const quizPlugin: Plugin = {
  id: QUIZ_PLUGIN_ID,
  name: 'Quiz',
  version: '1.0.0',
  init(ctx) {
    ctx.registerNoteType({
      id: QUIZ_NOTE_KIND,
      label: 'Quiz',
      icon: GraduationCap,
      View: QuizNoteView,
      Editor: QuizNoteEditor,
      newContent: () => EMPTY_QUIZ_CONTENT,
      toSearchText: (note) => quizToSearchText(note.content),
      toExportMarkdown: (note) => quizToExportMarkdown(note.content),
    })
  },
}
