// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure outgoing-link / backlink derivation for the right-rail Links panel.
// Content-derived (via noteLinkText) rather than read from the links table, so
// the panel tracks the live draft as you type and needs no IPC.

import { DEFAULT_VAULT_ID, type Note } from '../types'
import { extractWikilinkTitles, normalizeTitle, resolveNoteByTitle } from '../core/markdown/wikilinks'
import { noteLinkText } from './noteTypes'

export interface OutgoingLink {
  title: string
  /** The resolved note, or undefined for an unresolved `[[title]]`. */
  note?: Note
}

const titleLookup = (notes: Note[]) => {
  const byId = new Map(notes.map((n) => [n.id, n.title]))
  return (id: string) => byId.get(id)
}

/** Distinct `[[links]]` out of `note`, in document order, resolved where possible. */
export function outgoingLinks(note: Note, allNotes: Note[]): OutgoingLink[] {
  const seen = new Set<string>()
  const out: OutgoingLink[] = []
  for (const title of extractWikilinkTitles(noteLinkText(note, titleLookup(allNotes)))) {
    const key = normalizeTitle(title)
    if (seen.has(key)) continue
    seen.add(key)
    const target = resolveNoteByTitle(title, allNotes, note.vaultId ?? DEFAULT_VAULT_ID)
    if (target?.id === note.id) continue // a self-link isn't a connection
    out.push({ title, note: target })
  }
  return out
}

/** Notes in `vaultId` (other than `excludeId`) whose links point at `title` —
 *  used for backlinks, and to find which notes must re-sync (or be rewritten)
 *  when a note with that title is created or renamed. */
export function notesLinkingTo(title: string, vaultId: string, allNotes: Note[], excludeId?: string): Note[] {
  const key = normalizeTitle(title)
  if (!key) return []
  const titleOf = titleLookup(allNotes)
  return allNotes.filter(
    (n) =>
      n.id !== excludeId &&
      (n.vaultId ?? DEFAULT_VAULT_ID) === vaultId &&
      extractWikilinkTitles(noteLinkText(n, titleOf)).some((t) => normalizeTitle(t) === key),
  )
}

/** Notes in the same vault whose links point at `note`'s title. */
export function backlinks(note: Note, allNotes: Note[]): Note[] {
  return notesLinkingTo(note.title, note.vaultId ?? DEFAULT_VAULT_ID, allNotes, note.id)
}
