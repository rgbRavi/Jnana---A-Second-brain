// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef, useState } from 'react'
import type { Note } from '../types'
import { useRag } from './useRag'
import { useViewState } from './useViewState'
import { rankHits, type SemanticResult } from '../core/ai/searchResults'
import { log } from '../lib/logger'

const DEBOUNCE_MS = 400
// Over-fetch chunks: several may map to the same note, and some hit notes may
// be out of the caller's scope. rankHits collapses to one-per-note afterwards.
const FETCH_K = 40

/**
 * Semantic search for the Search view's AI mode. Debounced (embedding a query
 * is a network round-trip), scoped to `notes` (the caller passes the already
 * vault/workspace-filtered set), and de-duplicated to one result per note.
 */
export function useSemanticSearch(notes: Note[]) {
  const { config, stats, search } = useRag()
  const [query, setQuery] = useViewState('search:semantic:query', '')
  const [results, setResults] = useState<SemanticResult[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'done'>('idle')

  // Read notes through a ref so a note save (new array identity) doesn't restart
  // the debounce timer; the latest set is used when the query actually fires.
  const notesRef = useRef(notes)
  notesRef.current = notes

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setStatus('idle')
      return
    }
    setStatus('searching')
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const hits = await search(q, FETCH_K)
        if (cancelled) return
        setResults(rankHits(hits, notesRef.current))
      } catch (err) {
        if (!cancelled) setResults([])
        log.error('[useSemanticSearch] retrieval failed', err)
      } finally {
        if (!cancelled) setStatus('done')
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, search])

  const available = config.enabled && stats.chunkCount > 0

  return { query, setQuery, results, status, available }
}
