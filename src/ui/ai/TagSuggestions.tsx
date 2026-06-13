import { useState } from 'react'
import type { Note, TagSuggestion } from '../../types'
import { loadAiConfig, suggestTags } from '../../core/ai'
import styles from './TagSuggestions.module.css'

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
 * AI tag suggestions for a note. On demand (never automatic): it suggests tags
 * grounded in the note + the user's vocabulary, shows existing tags before
 * proposed-new ones with a reason on hover, and applies a tag only when the
 * user clicks it. Nothing mutates the note until then.
 */
export function TagSuggestions({ note, vocabulary, currentTags, onAccept }: Props) {
  const [items, setItems] = useState<TagSuggestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const config = await loadAiConfig()
      if (!config.enabled) {
        setError('Enable AI in AI settings to suggest tags.')
        return
      }
      setItems(await suggestTags(note, config, vocabulary))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not suggest tags.')
    } finally {
      setLoading(false)
    }
  }

  const accept = (tag: string) => {
    onAccept(tag)
    setItems((prev) => (prev ? prev.filter((s) => s.tag !== tag) : prev))
  }

  // Hide suggestions already on the note (the model may echo existing tags).
  const visible = items?.filter((s) => !currentTags.includes(s.tag)) ?? null

  return (
    <div className={styles.wrap}>
      <button className={styles.suggestBtn} onClick={run} disabled={loading}>
        {loading ? 'Thinking…' : '✨ Suggest tags'}
      </button>

      {error && <span className={styles.error}>{error}</span>}

      {visible && visible.length === 0 && !loading && (
        <span className={styles.empty}>No new tags to suggest.</span>
      )}

      {visible && visible.length > 0 && (
        <div className={styles.chips}>
          {visible.map((s) => (
            <button
              key={s.tag}
              className={`${styles.chip} ${s.isNew ? styles.chipNew : ''}`}
              title={s.reason || (s.isNew ? 'New tag' : 'From your existing tags')}
              onClick={() => accept(s.tag)}
            >
              + {s.tag}
              {s.isNew && <span className={styles.newMark}>new</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
