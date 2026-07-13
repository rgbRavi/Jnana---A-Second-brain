// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useMemo, useState } from 'react'
import type { NoteViewProps } from '../../lib/noteTypes'
import { parseDeck } from './deck'
import { newSchedule, isDue, schedule, type Grade } from './sm2'
import { loadSchedule, saveSchedule, type ScheduleMap } from './store'
import Styles from './Flashcards.module.css'

const GRADES: { grade: Grade; label: string; hint: string }[] = [
  { grade: 'again', label: 'Again', hint: 'forgot' },
  { grade: 'hard', label: 'Hard', hint: '' },
  { grade: 'good', label: 'Good', hint: '' },
  { grade: 'easy', label: 'Easy', hint: 'known' },
]

/**
 * Study view for a flashcard deck. Cards come from the note's content (JSON); the
 * SM-2 schedule is loaded from plugin_kv, and each grade updates + persists it —
 * so due counts survive an app reload. Review order is a per-session queue:
 * "again" re-queues the card to the end; the rest graduate out.
 */
export function FlashcardDeckView({ note }: NoteViewProps) {
  const cards = useMemo(() => parseDeck(note.content).cards, [note.content])
  const [map, setMap] = useState<ScheduleMap | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  const [flipped, setFlipped] = useState(false)

  // Load schedule + build the initial due queue when the deck (note/content) changes.
  useEffect(() => {
    let active = true
    void loadSchedule(note.id).then((loaded) => {
      if (!active) return
      const now = Date.now()
      const due = cards
        .filter((c) => {
          const s = loaded[c.id]
          return !s || isDue(s, now)
        })
        .map((c) => c.id)
      setMap(loaded)
      setQueue(due)
      setFlipped(false)
    })
    return () => {
      active = false
    }
  }, [note.id, cards])

  if (cards.length === 0) {
    return (
      <div className={Styles.empty}>
        This deck has no cards yet. Switch to the editing view to add some.
      </div>
    )
  }

  if (map === null) {
    return <div className={Styles.empty}>Loading…</div>
  }

  const currentId = queue[0]
  const current = cards.find((c) => c.id === currentId)

  if (!current) {
    return (
      <div className={Styles.wrap}>
        <div className={Styles.summary}>
          <strong>{cards.length}</strong> card{cards.length === 1 ? '' : 's'} · all caught up 🎉
        </div>
        <div className={Styles.done}>No cards are due right now. Come back later!</div>
      </div>
    )
  }

  const grade = (g: Grade) => {
    const now = Date.now()
    const prev = map[currentId] ?? newSchedule(now)
    const next = schedule(prev, g, now)
    const nextMap = { ...map, [currentId]: next }
    setMap(nextMap)
    void saveSchedule(note.id, nextMap)
    setQueue(([head, ...tail]) => (g === 'again' ? [...tail, head] : tail))
    setFlipped(false)
  }

  return (
    <div className={Styles.wrap}>
      <div className={Styles.summary}>
        <strong>{queue.length}</strong> due · {cards.length} total
      </div>

      <div className={Styles.card} onClick={() => setFlipped((f) => !f)}>
        <div className={Styles.side}>{flipped ? 'Answer' : 'Question'}</div>
        <div className={Styles.face}>{flipped ? current.back : current.front}</div>
        {!flipped && <div className={Styles.hint}>Click to reveal the answer</div>}
      </div>

      {flipped && (
        <div className={Styles.grades}>
          {GRADES.map(({ grade: g, label, hint }) => (
            <button key={g} className={Styles.grade} onClick={() => grade(g)}>
              {label}
              {hint && <b>{hint}</b>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
