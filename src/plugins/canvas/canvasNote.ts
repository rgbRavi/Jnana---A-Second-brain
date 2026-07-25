// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure projections of a canvas note's content (a serialized CanvasDoc) into the
// plain-text + markdown forms the note-type infra wants for search and export.

import { parseDoc, serializeDoc, EMPTY_DOC, type CanvasNode } from '../../core/canvas'

export const EMPTY_CANVAS_CONTENT = serializeDoc(EMPTY_DOC)

const nodeLabel = (n: CanvasNode): string => n.text?.trim() || n.url || n.file || ''

/** Plain-text projection for search/RAG/preview — text nodes + urls/filenames.
 *  Placed note cards are indexed by their own note already, so we skip them here. */
export function canvasToSearchText(content: string): string {
  return parseDoc(content).nodes.map(nodeLabel).filter(Boolean).join('\n').trim()
}

/** Best-effort markdown for export. ponytail: flat node list, no spatial layout / media inlining. */
export function canvasToExportMarkdown(content: string): string {
  const doc = parseDoc(content)
  if (doc.nodes.length === 0) return '_Empty canvas._'
  const lines = doc.nodes.map((n) => {
    if (n.type === 'text') return `- ${n.text ?? ''}`
    if (n.type === 'link') return `- [webpage](${n.url ?? ''})`
    if (n.type === 'media') return `- ![media](${n.file ?? ''})`
    if (n.type === 'note') return `- [[note:${n.noteId ?? ''}]]`
    return `- (node)`
  })
  return `# Canvas\n\n${lines.join('\n')}`
}
