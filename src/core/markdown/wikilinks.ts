// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Shared, pure helpers for `[[wikilink]]` resolution + autocomplete detection.
// No CM6/React deps so they're unit-testable and reusable by the editor
// (autocomplete), the graph (pseudo-nodes), and the wikilink widget.

import { DEFAULT_VAULT_ID } from '../../types'

/** Minimal note shape the wikilink helpers need (any Note satisfies this). */
export interface TitledNote {
  id: string
  title: string
}

/** Case/whitespace-insensitive key for matching a `[[title]]` to a note. */
export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}

/** All `[[Title]]` targets in a note's content, trimmed, empties dropped. */
export function extractWikilinkTitles(content: string): string[] {
  return [...content.matchAll(/\[\[(.*?)\]\]/g)].map((m) => m[1].trim()).filter(Boolean)
}

/** Resolve a `[[title]]` to an existing note (case-insensitive), or undefined.
 *  Pass `vaultId` to match only notes in that vault — links never cross vaults
 *  (the Rust `sync_links` resolves the same way). */
export function resolveNoteByTitle<T extends TitledNote & { vaultId?: string | null }>(
  title: string,
  notes: T[],
  vaultId?: string,
): T | undefined {
  const key = normalizeTitle(title)
  return notes.find(
    (n) => normalizeTitle(n.title) === key && (vaultId === undefined || (n.vaultId ?? DEFAULT_VAULT_ID) === vaultId),
  )
}

/** Rewrite every `[[from]]` (case/whitespace-insensitive) to `[[to]]` — the
 *  "update links" step of a note rename. Returns the input unchanged if none. */
export function renameWikilinks(content: string, from: string, to: string): string {
  const key = normalizeTitle(from)
  if (!key) return content
  return content.replace(/\[\[(.*?)\]\]/g, (whole, inner: string) =>
    normalizeTitle(inner) === key ? `[[${to.trim()}]]` : whole,
  )
}

/** Stable graph-node id for an unresolved (pseudo) wikilink target. */
export function pseudoNodeId(title: string): string {
  return `pseudo:${normalizeTitle(title)}`
}

/**
 * Detect an open `[[` autocomplete context at `cursor`. Returns the offset just
 * after the `[[`, the query typed so far, and whether a `]]` immediately
 * follows the cursor (so completion can consume it instead of duplicating).
 * Returns null unless the cursor sits inside an unclosed `[[…` with no
 * intervening `]`, `[`, or newline (so a finished `[[Foo]]` never re-triggers).
 * The caller is responsible for having verified the selection is empty.
 */
export function detectWikilinkContext(
  doc: string,
  cursor: number,
): { contentStart: number; query: string; hasClose: boolean } | null {
  if (cursor < 2 || cursor > doc.length) return null
  const open = doc.lastIndexOf('[[', cursor - 2)
  if (open === -1) return null
  const contentStart = open + 2
  const query = doc.slice(contentStart, cursor)
  if (/[[\]\n]/.test(query)) return null
  return { contentStart, query, hasClose: doc.slice(cursor, cursor + 2) === ']]' }
}
