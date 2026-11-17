// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import MiniSearch, { SearchResult } from 'minisearch'
import type { Note } from '../types'
import { noteSearchText } from '../lib/noteTypes'

type IndexedNote = {
  id: string
  title: string
  content: string
  tags: string
  updatedAt: number
}

// Index the note-type search projection (plain text for typed notes — never their
// JSON) plus any attachment text (PDF contents), so both are findable by keyword.
function toIndexedNote(note: Note, extra = ''): IndexedNote {
  const text = noteSearchText(note) ?? ''
  return {
    id: note.id,
    title: note.title ?? '',
    content: extra ? `${text}\n\n${extra}` : text,
    tags: (note.tags || []).join(' '),
    updatedAt: note.updatedAt,
  }
}

export async function createNoteIndex(notes: Note[], attachmentText?: Map<string, string>) {
  const index = new MiniSearch<IndexedNote>({
    idField: 'id',
    fields: ['title', 'content', 'tags'],
    storeFields: ['title', 'content', 'tags', 'updatedAt'],
  })

  await index.addAllAsync(
    notes.map((n) => toIndexedNote(n, attachmentText?.get(n.id) ?? '')),
    { chunkSize: 200 },
  )
  return index
}

export function searchNotes(query: string, index: MiniSearch<IndexedNote>): SearchResult[] {
  if (!query.trim()) return []

  return index.search(query, {
    boost: { title: 3, tags: 2, content: 1 },
    prefix: true,
    fuzzy: 0.2,
  })
}
