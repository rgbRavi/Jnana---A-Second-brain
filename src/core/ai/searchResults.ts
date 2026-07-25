// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Note, RetrievalHit } from '../../types'

export interface SemanticResult {
  note: Note
  snippet: string
  score: number
}

/**
 * The chunker prepends `title\n\n` to every chunk so it stays self-describing
 * out of context (see chunk.ts). Drop that prefix for display and collapse
 * whitespace so the snippet reads like prose.
 */
function snippetOf(chunkText: string): string {
  const parts = chunkText.split('\n\n')
  const body = parts.length > 1 ? parts.slice(1).join('\n\n') : chunkText
  return body.replace(/\s+/g, ' ').trim()
}

/**
 * Collapse raw vector hits into one result per note (best-scoring chunk wins),
 * keep only notes present in `notes` (the caller's scoped set — this is how the
 * semantic results honour the active vault/workspace, mirroring keyword search),
 * and sort by score descending.
 */
export function rankHits(hits: RetrievalHit[], notes: Note[]): SemanticResult[] {
  const byId = new Map<string, Note>(notes.map((n) => [n.id, n]))
  const best = new Map<string, RetrievalHit>()
  for (const h of hits) {
    if (!byId.has(h.noteId)) continue
    const prev = best.get(h.noteId)
    if (!prev || h.score > prev.score) best.set(h.noteId, h)
  }
  return [...best.values()]
    .map((h) => ({ note: byId.get(h.noteId)!, snippet: snippetOf(h.chunkText), score: h.score }))
    .sort((a, b) => b.score - a.score)
}
