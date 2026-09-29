// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure projections of a canvas note's content (a serialized CanvasDoc) into the
// plain-text + markdown forms the note-type infra wants for search and export.

import { parseDoc, serializeDoc, EMPTY_DOC, type CanvasNode } from '../../core/canvas'
import { renameWikilinks } from '../../core/markdown/wikilinks'
import type { NoteMedia, NoteMediaKind } from '../../core/markdown/noteMedia'

export const EMPTY_CANVAS_CONTENT = serializeDoc(EMPTY_DOC)

const nodeLabel = (n: CanvasNode): string => n.text?.trim() || n.url || n.file || ''

/** Plain-text projection for search/RAG/preview — text nodes + urls/filenames.
 *  Placed note cards are indexed by their own note already, so we skip them here. */
export function canvasToSearchText(content: string): string {
  return parseDoc(content).nodes.map(nodeLabel).filter(Boolean).join('\n').trim()
}

/** Outbound links of a canvas: `[[wikilinks]]` typed in text cards, plus one
 *  `[[Title]]` per placed note card (a card is a reference to that note). */
export function canvasToLinkText(content: string, titleOf: (id: string) => string | undefined): string {
  return parseDoc(content)
    .nodes.map((n) => {
      if (n.type === 'text') return n.text ?? ''
      const title = n.type === 'note' && n.noteId ? titleOf(n.noteId)?.trim() : ''
      return title ? `[[${title}]]` : ''
    })
    .filter(Boolean)
    .join('\n')
}

/** Rewrite `[[from]]` → `[[to]]` inside text cards (a rename's "update links").
 *  Note cards reference notes by id, so they need no change. Returns the input
 *  string untouched when nothing matched (so callers can skip a save). */
export function canvasRenameLinks(content: string, from: string, to: string): string {
  const doc = parseDoc(content)
  let changed = false
  const nodes = doc.nodes.map((n) => {
    if (n.type !== 'text' || !n.text) return n
    const text = renameWikilinks(n.text, from, to)
    if (text === n.text) return n
    changed = true
    return { ...n, text }
  })
  return changed ? serializeDoc({ ...doc, nodes }) : content
}

const CANVAS_MEDIA_KINDS = new Set(['image', 'video', 'audio', 'pdf'])

/** Media placed on the board (media cards + web cards), deduped, board order. */
export function canvasToMedia(content: string): NoteMedia[] {
  const seen = new Set<string>()
  const out: NoteMedia[] = []
  for (const n of parseDoc(content).nodes) {
    let media: NoteMedia | null = null
    if (n.type === 'media' && n.file) {
      const kind = (CANVAS_MEDIA_KINDS.has(n.mediaType ?? '') ? n.mediaType : 'image') as NoteMediaKind
      media = { kind, label: n.file, source: 'asset', target: n.file }
    } else if (n.type === 'link' && n.url) {
      const kind: NoteMediaKind = /youtube\.com|youtu\.be/i.test(n.url) ? 'youtube' : 'webpage'
      media = { kind, label: n.url, source: 'url', target: n.url }
    }
    if (!media || seen.has(`${media.source}:${media.target}`)) continue
    seen.add(`${media.source}:${media.target}`)
    out.push(media)
  }
  return out
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
