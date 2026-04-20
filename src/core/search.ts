import MiniSearch, { SearchResult } from 'minisearch'
import type { Note } from '../types'

type IndexedNote = {
  id: string
  title: string
  content: string
  tags: string
  updatedAt: number
}

function toIndexedNote(note: Note): IndexedNote {
  return {
    id: note.id,
    title: note.title ?? '',
    content: note.content ?? '',
    tags: (note.tags || []).join(' '),
    updatedAt: note.updatedAt,
  }
}

export async function createNoteIndex(notes: Note[]) {
  const index = new MiniSearch<IndexedNote>({
    idField: 'id',
    fields: ['title', 'content', 'tags'],
    storeFields: ['title', 'content', 'tags', 'updatedAt'],
    searchOptions: {
      boost: { title: 3, tags: 2, content: 1 },
      prefix: true,
      fuzzy: 0.1,
    },
  })

  await index.addAllAsync(notes.map(toIndexedNote), { chunkSize: 200 })
  return index
}

export function updateIndexedNote(index: MiniSearch<IndexedNote>, note: Note) {
  const doc = toIndexedNote(note)

  if (index.has(doc.id)) {
    index.replace(doc)
  } else {
    index.add(doc)
  }
}

export function removeIndexedNote(index: MiniSearch<IndexedNote>, id: string) {
  if (index.has(id)) {
    index.discard(id)
  }
}

export function searchNotes(query: string, index: MiniSearch<IndexedNote>): SearchResult[] {
  if (!query.trim()) return []

  return index.search(query, {
    boost: { title: 3, tags: 2, content: 1 },
    prefix: true,
    fuzzy: 0.1,
  })
}

