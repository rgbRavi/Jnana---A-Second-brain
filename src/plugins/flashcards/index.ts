// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Layers } from 'lucide-react'
import type { Plugin } from '../../types'
import { parseDeck, EMPTY_DECK_CONTENT } from './deck'
import { FLASHCARDS_PLUGIN_ID } from './store'
import { FlashcardDeckView } from './FlashcardDeckView'
import { FlashcardDeckEditor } from './FlashcardDeckEditor'

/** The note-type id a deck note carries in `note.kind`. */
export const FLASHCARD_DECK_KIND = 'flashcard-deck'

/**
 * First-party bundled plugin: a spaced-repetition flashcard deck note type. Cards
 * live as JSON in the note's content (so the deck rides folders/vaults/search/
 * export like any note); the SM-2 review schedule lives in plugin_kv. This is the
 * reference implementation of `registerNoteType` — the whole custom-note-type
 * capability, proven end-to-end.
 */
export const flashcardsPlugin: Plugin = {
  id: FLASHCARDS_PLUGIN_ID,
  name: 'Flashcards',
  version: '1.0.0',
  init(ctx) {
    ctx.registerNoteType({
      id: FLASHCARD_DECK_KIND,
      label: 'Flashcard deck',
      icon: Layers,
      View: FlashcardDeckView,
      Editor: FlashcardDeckEditor,
      newContent: () => EMPTY_DECK_CONTENT,
      // Index card text (not raw JSON) for search/RAG + card previews.
      toSearchText: (note) =>
        parseDeck(note.content)
          .cards.map((c) => `${c.front} ${c.back}`)
          .join('\n')
          .trim(),
      // Export as a readable Q/A list.
      toExportMarkdown: (note) => {
        const cards = parseDeck(note.content).cards
        if (cards.length === 0) return '_Empty flashcard deck._'
        return cards
          .map((c, i) => `### Card ${i + 1}\n\n**Q:** ${c.front}\n\n**A:** ${c.back}`)
          .join('\n\n')
      },
    })
  },
}
