import type { Note, NoteChunk } from '../../types'

const MAX_CHARS = 1200
const OVERLAP_CHARS = 150

/**
 * Strip embed/media markdown that carries no semantic meaning for retrieval
 * (asset URLs, YouTube links, external-file refs) while keeping human text.
 */
function cleanForEmbedding(content: string): string {
  return content
    // ![img|video|youtube|pdf](...) embeds
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    // [External: name](external://...) links → keep the visible label
    .replace(/\[([^\]]*)\]\((?:external|jnana-asset):\/\/[^)]*\)/g, '$1')
    // [[wikilink]] → keep the target text
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    // timestamp / page markers like [V0::01:23] or [D1::Page 4]
    .replace(/\[[A-Z]\d+::[^\]]*\]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/**
 * Split a note into overlapping chunks suitable for embedding. The title is
 * prepended to every chunk so a chunk stays self-describing once retrieved
 * out of context. Splitting prefers paragraph boundaries, falling back to a
 * hard character cut for very long paragraphs.
 */
export function chunkNote(note: Note): NoteChunk[] {
  const body = cleanForEmbedding(note.content)
  const title = note.title?.trim() || 'Untitled'

  if (!body) return []

  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

  const pieces: string[] = []
  let current = ''

  const flush = () => {
    if (current.trim()) pieces.push(current.trim())
    current = ''
  }

  for (const para of paragraphs) {
    if (para.length > MAX_CHARS) {
      flush()
      // Hard-split an oversized paragraph with overlap between slices.
      for (let i = 0; i < para.length; i += MAX_CHARS - OVERLAP_CHARS) {
        pieces.push(para.slice(i, i + MAX_CHARS))
      }
      continue
    }
    if (current.length + para.length + 2 > MAX_CHARS) {
      flush()
    }
    current = current ? `${current}\n\n${para}` : para
  }
  flush()

  return pieces.map((text, chunkIndex) => ({
    chunkIndex,
    chunkText: `${title}\n\n${text}`,
  }))
}
