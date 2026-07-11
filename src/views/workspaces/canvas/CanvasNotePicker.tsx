// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useMemo, useState } from 'react'
import type { Note } from '../../../types'
import styles from './canvas.module.css'

interface Props {
  /** Candidate pool — the workspace's notes. */
  notes: Note[]
  /** Already-placed note ids (excluded). */
  placedIds: Set<string>
  onPick: (ids: string[]) => void
  onClose: () => void
}

/** Pick workspace notes (searchable, multi-select) to drop onto the canvas. */
export function CanvasNotePicker({ notes, placedIds, onPick, onClose }: Props) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase()
    return notes
      .filter((n) => !placedIds.has(n.id))
      .filter((n) => !s || `${n.title}\n${n.content}`.toLowerCase().includes(s))
      .slice(0, 200)
  }, [notes, placedIds, q])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Add note cards</h2>
        <input
          className={styles.search}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search workspace notes…"
          autoFocus
        />
        <div className={styles.pickList}>
          {candidates.length === 0 && <p className={styles.empty}>No notes to add.</p>}
          {candidates.map((n) => (
            <label key={n.id} className={styles.pickRow}>
              <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} />
              {n.title || 'Untitled'}
            </label>
          ))}
        </div>
        <button
          className={styles.toolBtn}
          style={{ alignSelf: 'flex-end' }}
          onClick={() => { onPick([...selected]); onClose() }}
          disabled={selected.size === 0}
        >
          Add {selected.size || ''}
        </button>
      </div>
    </div>
  )
}
