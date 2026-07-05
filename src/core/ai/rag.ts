import { invoke } from '@tauri-apps/api/core'
import type { AiConfig, IndexStats, IndexTime, Note, RetrievalHit } from '../../types'
import { chunkNote } from './chunk'
import { getEmbeddingProvider } from './provider'
import { log } from '../../lib/logger'

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

  const vectors = await getEmbeddingProvider(config).embed(chunks.map((c) => c.chunkText))

  const payload = chunks.map((c, i) => ({
    chunkIndex: c.chunkIndex,
    chunkText: c.chunkText,
    vector: vectors[i] ?? [],
  }))

  await invoke('save_note_embeddings', {
    noteId: note.id,
    model: config.embeddingModel,
    chunks: payload,
  })

  return payload.length
}

export async function removeNoteFromIndex(noteId: string): Promise<void> {
  await invoke('delete_note_embeddings', { noteId })
}

/**
 * Optional retrieval scope: when set, every `retrieve()` is restricted to these
 * note ids. Used by the workspace AI scope (set while the AI view is mounted,
 * cleared on unmount). A module global so callers deep in the agent loop honor
 * it without threading a parameter through every call site.
 */
let retrievalScope: Set<string> | null = null

/** Restrict (or, with null, unrestrict) all subsequent retrievals to these note ids. */
export function setRetrievalScope(ids: Set<string> | null): void {
  retrievalScope = ids && ids.size > 0 ? ids : null
}

export function getRetrievalScope(): Set<string> | null {
  return retrievalScope
}

/**
 * Semantic retrieval: embed the query and return the closest chunks.
 * This is the shared primitive every RAG feature (analyzer, link suggester,
 * quiz) builds on. When a retrieval scope is active, over-fetches and filters
 * to the scoped note ids (Rust search is global), then trims to `topK`.
 */
export async function retrieve(
  query: string,
  config: AiConfig,
  topK = 8,
): Promise<RetrievalHit[]> {
  if (!query.trim()) return []
  const [queryVector] = await getEmbeddingProvider(config).embed([query])
  if (!queryVector) return []

  const scope = retrievalScope
  const hits = await invoke<RetrievalHit[]>('search_embeddings', {
    queryVector,
    topK: scope ? Math.max(topK * 6, 48) : topK,
  })
  if (!scope) return hits
  return hits.filter((h) => scope.has(h.noteId)).slice(0, topK)
}

export async function getIndexedNoteIds(): Promise<string[]> {
  return invoke<string[]>('get_indexed_note_ids')
}

export async function getIndexStats(): Promise<IndexStats> {
  return invoke<IndexStats>('get_index_stats')
}

/** When each indexed note was last embedded — used to detect stale notes. */
export async function getIndexTimes(): Promise<IndexTime[]> {
  return invoke<IndexTime[]>('get_index_times')
}

/**
 * Notes that need (re)indexing: have embeddable text but were never indexed,
 * or were edited (`updatedAt`) after their last embedding.
 */
export function staleNotes(notes: Note[], indexTimes: IndexTime[]): Note[] {
  const indexedAt = new Map(indexTimes.map((t) => [t.noteId, t.indexedAt]))
  return notes.filter((n) => {
    if (chunkNote(n).length === 0) return false // nothing to embed
    const at = indexedAt.get(n.id)
    return at === undefined || (n.updatedAt ?? 0) > at
  })
}

/**
 * Transcribe a stored audio asset to text via the configured transcription
 * backend (OpenAI cloud or a local Whisper server). The host/key/model live
 * Rust-side; this just names the asset to transcribe.
 */
export async function transcribeAudio(filename: string): Promise<string> {
  return invoke<string>('transcribe_audio', { filename })
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
      log.error(`[rag] failed to index note ${note.id}`, err)
    }
    onProgress?.(++done, notes.length)
  }
}
