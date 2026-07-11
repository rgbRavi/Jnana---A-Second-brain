// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { AiConfig, LinkSuggestion, Note } from '../../types'
import { retrieve } from './rag'

const MAX_SUGGESTIONS = 5
const QUERY_CHARS = 4000

/**
 * Suggest `[[wikilinks]]` from this note to related notes, using semantic
 * retrieval over the vector store. The note's own text is the query; the
 * matching chunk from each candidate note is returned as evidence. Notes that
 * are this note, or already linked from its content, are excluded.
 *
 * Pure retrieval — no LLM call. Requires the other notes to be indexed.
 */
export async function suggestLinks(
  note: Note,
  config: AiConfig,
  allNotes: Note[],
): Promise<LinkSuggestion[]> {
  const query = `${note.title ?? ''}\n${note.content ?? ''}`.trim().slice(0, QUERY_CHARS)
  if (!query) return []

  // Titles already wikilinked from this note's content — don't re-suggest them.
  const linkedTitles = new Set(
    [...note.content.matchAll(/\[\[(.*?)\]\]/g)].map((m) => m[1].trim().toLowerCase()),
  )

  const hits = await retrieve(query, config, MAX_SUGGESTIONS * 4)
  const byId = new Map(allNotes.map((n) => [n.id, n]))

  const seen = new Set<string>()
  const out: LinkSuggestion[] = []
  for (const hit of hits) {
    if (hit.noteId === note.id || seen.has(hit.noteId)) continue
    const target = byId.get(hit.noteId)
    if (!target) continue
    if (linkedTitles.has((target.title ?? '').trim().toLowerCase())) continue

    seen.add(hit.noteId)
    out.push({
      noteId: target.id,
      title: target.title?.trim() || 'Untitled',
      evidence: hit.chunkText.trim().slice(0, 220),
      score: hit.score,
    })
    if (out.length >= MAX_SUGGESTIONS) break
  }
  return out
}
