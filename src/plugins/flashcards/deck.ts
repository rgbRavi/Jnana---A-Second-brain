// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The flashcard deck's on-note data model. A deck note stores its cards as JSON in
// `note.content`; review scheduling lives separately in plugin_kv (see sm2.ts).
// Pure parse/serialize helpers, tolerant of malformed content (empty deck).

export interface Flashcard {
  id: string
  front: string
  back: string
}

export interface Deck {
  cards: Flashcard[]
}

export function parseDeck(content: string): Deck {
  try {
    const raw = JSON.parse(content) as unknown
    if (raw && typeof raw === 'object' && Array.isArray((raw as Deck).cards)) {
      const cards = (raw as Deck).cards
        .filter((c) => c && typeof c.id === 'string')
        .map((c) => ({ id: c.id, front: String(c.front ?? ''), back: String(c.back ?? '') }))
      return { cards }
    }
  } catch {
    // fall through to empty deck
  }
  return { cards: [] }
}

export function serializeDeck(deck: Deck): string {
  return JSON.stringify({ cards: deck.cards })
}

export function newCard(): Flashcard {
  return { id: crypto.randomUUID(), front: '', back: '' }
}

export const EMPTY_DECK_CONTENT = serializeDeck({ cards: [] })
