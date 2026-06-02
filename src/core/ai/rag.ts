import { invoke } from '@tauri-apps/api/core'
import type { AiConfig, IndexStats, Note, RetrievalHit } from '../../types'
import { chunkNote } from './chunk'
import { getProvider } from './provider'

/**
 * Embed a note's chunks and persist them to the local vector store.
 * Replaces any existing embeddings for the note (safe to call on every save).
 * Returns the number of chunks indexed.
 */
export async function indexNote(note: Note, config: AiConfig): Promise<number> {
  const chunks = chunkNote(note)

  if (chunks.length === 0) {
    // Note has no embeddable text — clear any stale vectors and stop.
    await removeNoteFromIndex(note.id)
    return 0
  }

  const provider = getProvider(config)
  const vectors = await provider.embed(chunks.map((c) => c.chunkText))

  const payload = chunks.map((c, i) => ({
    chunkIndex: c.chunkIndex,
    chunkText: c.chunkText,
    vector: vectors[i] ?? [],
  }))

  await invoke('save_note_embeddings', {
    noteId: note.id,
    model: provider.embeddingModel,
    chunks: payload,
  })

  return payload.length
}

export async function removeNoteFromIndex(noteId: string): Promise<void> {
  await invoke('delete_note_embeddings', { noteId })
}

/**
 * Semantic retrieval: embed the query and return the closest chunks.
 * This is the shared primitive every RAG feature (analyzer, link suggester,
 * quiz) builds on.
 */
export async function retrieve(
  query: string,
  config: AiConfig,
  topK = 8,
): Promise<RetrievalHit[]> {
  if (!query.trim()) return []
  const provider = getProvider(config)
  const [queryVector] = await provider.embed([query])
  if (!queryVector) return []

  return invoke<RetrievalHit[]>('search_embeddings', {
    queryVector,
    topK,
  })
}

export async function getIndexedNoteIds(): Promise<string[]> {
  return invoke<string[]>('get_indexed_note_ids')
}

export async function getIndexStats(): Promise<IndexStats> {
  return invoke<IndexStats>('get_index_stats')
}

/**
 * (Re)index a batch of notes — used for the initial backfill or after a
 * provider/model change. Embeds notes sequentially to stay within provider
 * rate limits and reports progress so the UI can show a bar.
 */
export async function indexNotes(
  notes: Note[],
  config: AiConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let done = 0
  for (const note of notes) {
    try {
      await indexNote(note, config)
    } catch (err) {
      console.error(`[rag] failed to index note ${note.id}:`, err)
    }
    onProgress?.(++done, notes.length)
  }
}
