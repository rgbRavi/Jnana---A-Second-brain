// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Note, NoteChunk } from '../../types'
import { noteSearchText } from '../../lib/noteTypes'

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
 * JS strings are UTF-16, so any character outside the BMP — maths italics and
 * emoji, both common in text extracted from PDFs — is a *pair* of code units.
 * Cutting between the two leaves a lone surrogate, which cannot be encoded:
 * `JSON.stringify` emits a bare `\uD835`, and the Rust side rejects the entire
 * IPC message with "unexpected end of hex escape", so the note never indexes.
 */
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff

/** Slice [start, end) without splitting a surrogate pair at either edge. */
function sliceWholeChars(text: string, start: number, end: number): string {
  let from = start
  let to = Math.min(end, text.length)
  // Starting on the tail of a pair — its head went with the previous slice.
  if (from > 0 && isLowSurrogate(text.charCodeAt(from))) from++
  // Ending on the head of a pair — leave the whole character to the next slice.
  if (to < text.length && to > from && isHighSurrogate(text.charCodeAt(to - 1))) to--
  return text.slice(from, to)
}

/**
 * Replace any surrogate left without its partner. Belt-and-braces for text that
 * arrives already damaged (a PDF extractor emitting half a pair): one stray code
 * unit is enough to fail the note's whole IPC message.
 */
export function stripLoneSurrogates(text: string): string {
  if (!/[\uD800-\uDFFF]/.test(text)) return text // fast path: no pairs at all
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (isHighSurrogate(code)) {
      if (isLowSurrogate(text.charCodeAt(i + 1))) {
        out += text[i] + text[i + 1]
        i++
      } else {
        out += '�'
      }
    } else if (isLowSurrogate(code)) {
      out += '�'
    } else {
      out += text[i]
    }
  }
  return out
}

/**
 * Whether a note has any text worth embedding — the same test `chunkNote` makes
 * before it produces anything, without paying for the actual splitting. A note
 * that fails this can never appear in the vector store, so it must be left out
 * of "indexed / total" counts as well as out of the stale list.
 */
export function hasEmbeddableText(note: Note): boolean {
  return cleanForEmbedding(noteSearchText(note)).length > 0
}

/**
 * Split a note into overlapping chunks suitable for embedding. The title is
 * prepended to every chunk so a chunk stays self-describing once retrieved
 * out of context. Splitting prefers paragraph boundaries, falling back to a
 * hard character cut for very long paragraphs.
 */
export function chunkNote(note: Note, extraText = ''): NoteChunk[] {
  // Route through the note-type's search projection so a typed (e.g. JSON) note
  // embeds its real text instead of raw JSON; plain notes get their content back.
  // `extraText` is already-plain attachment text (e.g. PDF contents) — appended
  // as extra paragraphs so PDF text becomes semantically retrievable.
  const noteBody = cleanForEmbedding(noteSearchText(note))
  const extra = extraText.trim()
  const body = extra ? (noteBody ? `${noteBody}\n\n${extra}` : extra) : noteBody
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
        pieces.push(sliceWholeChars(para, i, i + MAX_CHARS))
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
    chunkText: stripLoneSurrogates(`${title}\n\n${text}`),
  }))
}
