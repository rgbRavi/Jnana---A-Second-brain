import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiConfig, IndexStats, Note, RetrievalHit } from '../types'
import { eventBus } from '../lib/eventBus'
import {
  defaultConfig,
  loadAiConfig,
  saveAiConfig,
  indexNote,
  indexNotes,
  removeNoteFromIndex,
  retrieve,
  getIndexStats,
} from '../core/ai'

/**
 * Orchestrates the local RAG layer for the UI:
 * - owns the AI config (provider/keys/models)
 * - keeps the vector store in sync with note saves/deletes when auto-index is on
 * - exposes `search` (semantic retrieval) and a backfill action
 *
 * This is the seam every higher-level AI feature (thread analyzer, link
 * suggester, quiz) will sit on top of.
 */
export function useRag() {
  const [config, setConfig] = useState<AiConfig>(() => defaultConfig())
  const [stats, setStats] = useState<IndexStats>({ chunkCount: 0, indexedNoteCount: 0 })
  const [indexing, setIndexing] = useState<{ done: number; total: number } | null>(null)

  // Config lives on the Rust side — load it once on mount.
  useEffect(() => {
    loadAiConfig()
      .then(setConfig)
      .catch((err) => console.error('[useRag] failed to load AI config:', err))
  }, [])

  // Keep a ref so event handlers always see the latest config without resubscribing.
  const configRef = useRef(config)
  configRef.current = config

  const updateConfig = useCallback((next: AiConfig) => {
    // Mirror the Rust-side key rules locally so the UI updates without a
    // reload: a typed key sets presence; changing baseUrl/provider drops it.
    setConfig((prev) => {
      const sameTarget = next.baseUrl === prev.baseUrl && next.provider === prev.provider
      return { ...next, hasApiKey: next.apiKey ? true : sameTarget && !!prev.hasApiKey }
    })
    void saveAiConfig(next).catch((err) =>
      console.error('[useRag] failed to save AI config:', err),
    )
  }, [])

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getIndexStats())
    } catch (err) {
      console.error('[useRag] failed to load index stats:', err)
    }
  }, [])

  useEffect(() => {
    void refreshStats()
  }, [refreshStats])

  // Auto-sync the vector store with note lifecycle events.
  useEffect(() => {
    const handleSaved = (note: Note) => {
      const cfg = configRef.current
      if (!cfg.enabled || !cfg.autoIndex) return
      void indexNote(note, cfg)
        .then(refreshStats)
        .catch((err) => console.error('[useRag] auto-index failed:', err))
    }

    const handleDeleted = ({ id }: { id: string }) => {
      void removeNoteFromIndex(id).then(refreshStats).catch(() => {})
    }

    eventBus.on('note:saved', handleSaved)
    eventBus.on('note:deleted', handleDeleted)
    return () => {
      eventBus.off('note:saved', handleSaved)
      eventBus.off('note:deleted', handleDeleted)
    }
  }, [refreshStats])

  /** Semantic search over all indexed notes. */
  const search = useCallback(
    (query: string, topK = 8): Promise<RetrievalHit[]> => {
      if (!config.enabled) return Promise.resolve([])
      return retrieve(query, config, topK)
    },
    [config],
  )

  /** (Re)embed the given notes — used for first-run backfill or after a model change. */
  const reindexAll = useCallback(
    async (notes: Note[]) => {
      if (!config.enabled) return
      setIndexing({ done: 0, total: notes.length })
      await indexNotes(notes, config, (done, total) => setIndexing({ done, total }))
      setIndexing(null)
      await refreshStats()
    },
    [config, refreshStats],
  )

  return { config, updateConfig, stats, indexing, search, reindexAll, refreshStats }
}
