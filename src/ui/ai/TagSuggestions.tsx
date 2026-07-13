// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Note, TagSuggestion } from '../../types'
import { loadAiConfig, suggestTags } from '../../core/ai'
import { SuggestionMenu } from './SuggestionMenu'
import styles from './Suggestions.module.css'

interface Props {
  note: Note
  /** The user's existing tag vocabulary across all notes (for the model to prefer). */
  vocabulary: string[]
  /** User tags already on this note — suggestions matching these are hidden. */
  currentTags: string[]
  /** Apply a tag to the note. */
  onAccept: (tag: string) => void
}

/**
 * AI tag suggestions for a note — an icon button that, on click, suggests tags
 * grounded in the note + the user's vocabulary and opens a checkbox dropdown;
 * ticked tags are applied on **Apply**. Nothing mutates the note until then.
 */
export function TagSuggestions({ note, vocabulary, currentTags, onAccept }: Props) {
  const run = async (): Promise<TagSuggestion[]> => {
    const config = await loadAiConfig()
    if (!config.enabled) throw new Error('Enable AI in AI settings to suggest tags.')
    const items = await suggestTags(note, config, vocabulary)
    // Hide tags already on the note (the model may echo existing ones).
    return items.filter((s) => !currentTags.includes(s.tag))
  }

  return (
    <SuggestionMenu<TagSuggestion>
      icon="✨"
      label="Suggest tags"
      keyOf={(s) => s.tag}
      run={run}
      onApply={(items) => items.forEach((s) => onAccept(s.tag))}
      loadingText="Thinking…"
      emptyText="No new tags to suggest."
      renderItem={(s) => (
        <span className={styles.tagName} title={s.reason || (s.isNew ? 'New tag' : 'From your existing tags')}>
          {s.tag}
          {s.isNew && <span className={styles.newMark}>new</span>}
        </span>
      )}
    />
  )
}
