// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useMemo } from 'react'
import type { Note } from '../../types'
import { isAutoTag } from '../../core/tags'
import { TagSuggestions } from './TagSuggestions'
import { LinkSuggestions } from './LinkSuggestions'

interface Props {
  /** The note (or live draft) the suggestions are about. */
  note: Note
  /** All notes — source of the tag vocabulary and link-retrieval candidates. */
  allNotes: Note[]
  /** User tags already on the note (so they aren't re-suggested). */
  currentTags: string[]
  /** Apply a tag; omit to hide tag suggestions. */
  onAddTag?: (tag: string) => void
  /** Add a `[[wikilink]]`; omit to hide link suggestions. */
  onAddLink?: (title: string) => void
}

/**
 * The AI tag + link suggestion pair, shared by every composer and the note
 * modal. Computes the tag vocabulary once; each panel renders only if its
 * handler is provided.
 */
export function ComposerSuggestions({ note, allNotes, currentTags, onAddTag, onAddLink }: Props) {
  const vocabulary = useMemo(
    () => [...new Set(allNotes.flatMap((n) => n.tags).filter((t) => !isAutoTag(t)))],
    [allNotes],
  )

  return (
    <>
      {onAddTag && (
        <TagSuggestions note={note} vocabulary={vocabulary} currentTags={currentTags} onAccept={onAddTag} />
      )}
      {onAddLink && <LinkSuggestions note={note} allNotes={allNotes} onAddLink={onAddLink} />}
    </>
  )
}
