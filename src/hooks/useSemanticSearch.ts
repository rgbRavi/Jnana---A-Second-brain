// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef, useState } from 'react'
import type { Note } from '../types'
import { useRag } from './useRag'
import { rankHits, type SemanticResult } from '../core/ai/searchResults'
import { log } from '../lib/logger'

const DEBOUNCE_MS = 400
// Over-fetch chunks: several may map to the same note, and some hit notes may
// be out of the caller's scope. rankHits collapses to one-per-note afterwards.
const FETCH_K = 40

export type SemanticStatus = 'idle' | 'searching' | 'done' | 'error'

/**
 * Semantic ("by meaning") search for the command palette. Debounced (embedding a
 * query is a network round-trip) and de-duplicated to one result per note.
 * `retrieve()` already scopes to the active vault (+ any workspace scope).
 *
 * Mount it only while it's in use (`useRag` also auto-indexes on `note:saved`),
 * and only once AI is known to be on with a non-empty index — the caller checks.
 */
export function useSemanticSearch(notes: Note[], query: string) {
  const { search } = useRag()
  const [results, setResults] = useState<SemanticResult[]>([])
  const [status, setStatus] = useState<SemanticStatus>('idle')
  // retry() re-runs the current query at once (no debounce).
  const [nonce, setNonce] = useState(0)
  const immediateRef = useRef(false)

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
    const delay = immediateRef.current ? 0 : DEBOUNCE_MS
    immediateRef.current = false
    const t = setTimeout(async () => {
      try {
        const hits = await search(q, FETCH_K)
        if (cancelled) return
        setResults(rankHits(hits, notesRef.current))
        setStatus('done')
      } catch (err) {
        if (!cancelled) {
          setResults([])
          setStatus('error')
        }
        log.error('[useSemanticSearch] retrieval failed', err)
      }
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, search, nonce])

  const retry = () => {
    immediateRef.current = true
    setNonce((n) => n + 1)
  }

  return { results, status, retry }
}
