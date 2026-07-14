// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { NoteEditorProps } from '../../lib/noteTypes'
import { parseDeck, serializeDeck, newCard, type Flashcard } from './deck'
import Styles from './Flashcards.module.css'

/**
 * Edit surface for a flashcard deck. Cards are derived from the note's `content`
 * (JSON) and every edit re-serializes and bubbles up through `onChange` — so the
 * host's normal debounced autosave persists it, exactly like a markdown note.
 */
export function FlashcardDeckEditor({ value, onChange }: NoteEditorProps) {
  const cards = useMemo(() => parseDeck(value).cards, [value])

  const commit = (next: Flashcard[]) => onChange(serializeDeck({ cards: next }))

  const updateCard = (id: string, patch: Partial<Flashcard>) =>
    commit(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  return (
    <div className={Styles.wrap}>
      <div className={Styles.summary}>
        <strong>{cards.length}</strong> card{cards.length === 1 ? '' : 's'}
      </div>
      <div className={Styles.rows}>
        {cards.map((card) => (
          <div key={card.id} className={Styles.row}>
            <textarea
              className={Styles.input}
              placeholder="Front (question)"
              value={card.front}
              onChange={(e) => updateCard(card.id, { front: e.target.value })}
            />
            <textarea
              className={Styles.input}
              placeholder="Back (answer)"
              value={card.back}
              onChange={(e) => updateCard(card.id, { back: e.target.value })}
            />
            <button
              className={Styles.del}
              title="Delete card"
              aria-label="Delete card"
              onClick={() => commit(cards.filter((c) => c.id !== card.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button className={Styles.add} onClick={() => commit([...cards, newCard()])}>
        <Plus size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
        Add card
      </button>
    </div>
  )
}
