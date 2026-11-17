// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure helpers for search result previews: markdown -> plain text, a snippet
// window around the first hit, and hit/non-hit splitting for <mark> rendering.

/** Markdown -> single-line plain text (links/images/wikilinks flattened). */
export function plainText(content: string | undefined): string {
  if (!content) return ''
  return content
    .replace(/!\[[^\]]*\]\((.*?)\)/g, ' ')
    .replace(/\[([^\]]+)\]\((.*?)\)/g, '$1')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Case-insensitive matcher for the terms; a hit extends through the rest of its word (prefix matches). */
function termRegex(terms: string[]): RegExp | null {
  const parts = terms.filter(Boolean).sort((a, b) => b.length - a.length).map(escapeRe)
  return parts.length ? new RegExp(`(?:${parts.join('|')})[\\p{L}\\p{N}]*`, 'giu') : null
}

/** ~80 chars before / ~100 after the first term hit; first `fallback` chars when none. */
export function snippetAround(plain: string, terms: string[], before = 80, after = 100, fallback = 180): string {
  const m = termRegex(terms)?.exec(plain)
  if (!m) return plain.length > fallback ? `${plain.slice(0, fallback).trim()}…` : plain
  const start = Math.max(0, m.index - before)
  const end = Math.min(plain.length, m.index + after)
  return `${start > 0 ? '…' : ''}${plain.slice(start, end).trim()}${end < plain.length ? '…' : ''}`
}

export interface TextPart {
  text: string
  hit: boolean
}

/** Split text into hit / non-hit parts. No terms or no match -> one plain part. */
export function splitHighlight(text: string, terms: string[]): TextPart[] {
  const re = termRegex(terms)
  if (!re) return [{ text, hit: false }]
  const parts: TextPart[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m[0].length === 0) continue
    if (m.index > last) parts.push({ text: text.slice(last, m.index), hit: false })
    parts.push({ text: m[0], hit: true })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false })
  return parts.length ? parts : [{ text, hit: false }]
}

/** Trim to `limit` chars on a word boundary, adding an ellipsis when cut. */
export function trimWords(s: string, limit = 180): string {
  if (s.length <= limit) return s
  const cut = s.slice(0, limit)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > limit / 2 ? cut.slice(0, sp) : cut).trim()}…`
}
