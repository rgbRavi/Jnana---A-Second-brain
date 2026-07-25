// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Derive dotted "graph link" edges between placed note cards: if one card's note
// [[wikilinks]] another card's note, connect them. Derived on the fly from note
// content — never stored in the canvas doc. Reuses the wikilink extractor.

import { extractWikilinkTitles } from '../../../core/markdown/wikilinks'
import type { CanvasNode } from '../../../core/canvas'

export interface DerivedEdge {
  fromNode: string
  toNode: string
}

interface NoteLike {
  id: string
  title: string
  content: string
}

/** One edge per placed-card pair connected by a wikilink (deduped, unordered).
 *  `notesById` is read-only so a `Map<string, Note>` (a supertype value) fits. */
export function deriveWikilinkEdges(nodes: CanvasNode[], notesById: ReadonlyMap<string, NoteLike>): DerivedEdge[] {
  // Placed note cards, and a lowercased title → nodeId index for resolution.
  const cards = nodes.filter((n) => n.type === 'note' && n.noteId && notesById.has(n.noteId))
  const titleToNode = new Map<string, string>()
  for (const c of cards) {
    const note = notesById.get(c.noteId!)!
    if (note.title.trim()) titleToNode.set(note.title.trim().toLowerCase(), c.id)
  }

  const seen = new Set<string>()
  const out: DerivedEdge[] = []
  for (const c of cards) {
    const note = notesById.get(c.noteId!)!
    for (const title of extractWikilinkTitles(note.content)) {
      const targetNode = titleToNode.get(title.toLowerCase())
      if (!targetNode || targetNode === c.id) continue
      const key = [c.id, targetNode].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ fromNode: c.id, toNode: targetNode })
    }
  }
  return out
}
