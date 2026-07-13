// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { LinkSuggestion, Note } from '../../types'
import { loadAiConfig, suggestLinks } from '../../core/ai'
import { SuggestionMenu } from './SuggestionMenu'
import styles from './Suggestions.module.css'

interface Props {
  note: Note
  /** All notes, for resolving retrieval hits to titles. */
  allNotes: Note[]
  /** Add a `[[wikilink]]` to this note. */
  onAddLink: (title: string) => void
}

/**
 * AI link suggestions for a note — an icon button that, on click, runs semantic
 * retrieval for related notes and opens a checkbox dropdown (title + matching
 * passage); ticked notes are added as `[[wikilinks]]` on **Apply**. Never mutates
 * until then.
 */
export function LinkSuggestions({ note, allNotes, onAddLink }: Props) {
  const run = async (): Promise<LinkSuggestion[]> => {
    const config = await loadAiConfig()
    if (!config.enabled) throw new Error('Enable AI in AI settings to suggest links.')
    return suggestLinks(note, config, allNotes)
  }

  return (
    <SuggestionMenu<LinkSuggestion>
      icon="🔗"
      label="Suggest links"
      keyOf={(s) => s.noteId}
      run={run}
      onApply={(items) => items.forEach((s) => onAddLink(s.title))}
      loadingText="Finding related notes…"
      emptyText="No related notes found — index your notes and try again."
      renderItem={(s) => (
        <>
          <span className={styles.itemTitle}>{s.title}</span>
          <span className={styles.itemEvidence}>{s.evidence}</span>
        </>
      )}
    />
  )
}
