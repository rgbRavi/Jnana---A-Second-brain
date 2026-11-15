// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiConfig, IndexStats, Note, RetrievalHit } from '../types'
import { useActiveVaultId } from './useVaults'
import { eventBus } from '../lib/eventBus'
import { log } from '../lib/logger'
import {
  defaultConfig,
  loadAiConfig,
  saveAiConfig,
  indexNote,
  indexNotes,
  removeNoteFromIndex,
  retrieve,
  getIndexStats,
  getIndexTimes,
  staleNotes,
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
  const vaultId = useActiveVaultId()
  const [config, setConfig] = useState<AiConfig>(() => defaultConfig())
  const [instanceToken] = useState(() => Symbol('useRag'))
  const [stats, setStats] = useState<IndexStats>({ chunkCount: 0, indexedNoteCount: 0 })
  const [indexing, setIndexing] = useState<{ done: number; total: number } | null>(null)
  const [stale, setStale] = useState<Note[]>([])

  // Config lives on the Rust side — load it once on mount.
  useEffect(() => {
    loadAiConfig()
      .then(setConfig)
      .catch((err) => log.error('[useRag] failed to load AI config', err))
  }, [])

  // Settings and AI chat each own a useRag copy; this event keeps them in sync
  // (and replaces stale draft state after a preset command). Own saves are ignored.
  useEffect(() => {
    const onChanged = (p?: { config?: AiConfig; source?: symbol }) => {
      if (p?.source === instanceToken) return
      if (p?.config) {
        // Update the ref now too, so a caller that acts right after the event
        // (e.g. re-index after applying a preset) doesn't see the pre-render config.
        configRef.current = p.config
        setConfig(p.config)
      } else
        loadAiConfig()
          .then(setConfig)
          .catch((err) => log.error('[useRag] failed to reload AI config', err))
    }
    eventBus.on('ai:configChanged', onChanged)
    return () => eventBus.off('ai:configChanged', onChanged)
  }, [instanceToken])

  // Keep a ref so event handlers always see the latest config without resubscribing.
  const configRef = useRef(config)
  configRef.current = config

  const updateConfig = useCallback((next: AiConfig) => {
    // Mirror the Rust-side key rules locally so the UI updates without a
    // reload: a typed key sets presence; changing baseUrl/provider drops it.
    setConfig((prev) => {
      const sameChat = next.chatBaseUrl === prev.chatBaseUrl && next.chatProvider === prev.chatProvider
      const sameEmbed =
        next.embeddingBaseUrl === prev.embeddingBaseUrl &&
        next.embeddingProvider === prev.embeddingProvider
      const sameTx =
        next.transcriptionBaseUrl === prev.transcriptionBaseUrl &&
        next.transcriptionProvider === prev.transcriptionProvider
      return {
        ...next,
        hasChatApiKey: next.chatApiKey ? true : sameChat && !!prev.hasChatApiKey,
        hasEmbeddingApiKey: next.embeddingApiKey ? true : sameEmbed && !!prev.hasEmbeddingApiKey,
        hasTranscriptionApiKey: next.transcriptionApiKey
          ? true
          : sameTx && !!prev.hasTranscriptionApiKey,
      }
    })
    void saveAiConfig(next)
      .then(() => eventBus.emit('ai:configChanged', { source: instanceToken }))
      .catch((err) => log.error('[useRag] failed to save AI config', err))
  }, [instanceToken])

  // Stats follow the active vault, so switching vaults re-reads them (the
  // callback's identity change re-runs the effect below and the bus handlers).
  const refreshStats = useCallback(async () => {
    try {
      setStats(await getIndexStats(vaultId))
    } catch (err) {
      log.error('[useRag] failed to load index stats', err)
    }
  }, [vaultId])

  useEffect(() => {
    void refreshStats()
  }, [refreshStats])

  /** Recompute which notes need (re)indexing (edited since last embed, or never indexed). */
  const refreshStaleness = useCallback(async (notes: Note[]) => {
    if (!configRef.current.enabled) {
      setStale([])
      return
    }
    try {
      setStale(staleNotes(notes, await getIndexTimes()))
    } catch (err) {
      log.error('[useRag] staleness check failed', err)
    }
  }, [])

  // Auto-sync the vector store with note lifecycle events.
  useEffect(() => {
    const handleSaved = (note: Note) => {
      const cfg = configRef.current
      if (!cfg.enabled || !cfg.autoIndex) return
      void indexNote(note, cfg)
        .then(refreshStats)
        .catch((err) => log.error('[useRag] auto-index failed', err))
    }

    const handleDeleted = ({ id }: { id: string }) => {
      void removeNoteFromIndex(id)
        .then(refreshStats)
        .catch((err) => log.error('[useRag] failed to de-index deleted note', err))
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
      const cfg = configRef.current
      if (!cfg.enabled) return
      setIndexing({ done: 0, total: notes.length })
      await indexNotes(notes, cfg, (done, total) => setIndexing({ done, total }))
      setIndexing(null)
      await refreshStats()
      await refreshStaleness(notes)
    },
    [refreshStats, refreshStaleness],
  )

  return {
    config,
    updateConfig,
    stats,
    indexing,
    stale,
    search,
    reindexAll,
    refreshStats,
    refreshStaleness,
  }
}
