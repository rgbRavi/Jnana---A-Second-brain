// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import type { LinkSuggestion, Note } from '../../types'
import { loadAiConfig, suggestLinks } from '../../core/ai'
import styles from './LinkSuggestions.module.css'

interface Props {
  note: Note
  /** All notes, for resolving retrieval hits to titles. */
  allNotes: Note[]
  /** Add a `[[wikilink]]` to this note. */
  onAddLink: (title: string) => void
}

/**
 * AI link suggestions for a note. On demand: semantic retrieval finds related
 * notes and shows each with the matching passage as evidence; clicking adds a
 * `[[wikilink]]` to this note. Never mutates until the user clicks.
 */
export function LinkSuggestions({ note, allNotes, onAddLink }: Props) {
  const [items, setItems] = useState<LinkSuggestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const config = await loadAiConfig()
      if (!config.enabled) {
        setError('Enable AI in AI settings to suggest links.')
        return
      }
      setItems(await suggestLinks(note, config, allNotes))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not suggest links.')
    } finally {
      setLoading(false)
    }
  }

  const add = (s: LinkSuggestion) => {
    onAddLink(s.title)
    setItems((prev) => (prev ? prev.filter((x) => x.noteId !== s.noteId) : prev))
  }

  return (
    <div className={styles.wrap}>
      <button className={styles.suggestBtn} onClick={run} disabled={loading}>
        {loading ? 'Finding related notes…' : '🔗 Suggest links'}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {items && items.length === 0 && !loading && (
        <p className={styles.empty}>No related notes found — index your notes and try again.</p>
      )}

      {items && items.length > 0 && (
        <div className={styles.list}>
          {items.map((s) => (
            <div key={s.noteId} className={styles.item}>
              <div className={styles.itemBody}>
                <span className={styles.itemTitle}>{s.title}</span>
                <span className={styles.itemEvidence}>{s.evidence}</span>
              </div>
              <button className={styles.addBtn} onClick={() => add(s)} title={`Add [[${s.title}]]`}>
                + Link
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
