// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// One shared answer to "which notes should be linked but aren't", for the
// dashboard tile and the graph overlay. Tag pairs are pure and cheap, so they're
// derived per caller; AI pairs cost embedding calls, so they're computed once
// per (source, vault snapshot) and cached in this module store — the graph then
// paints exactly the pairs the tile counted, without a second pass.

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Note } from '../types'
import { loadAiConfig } from '../core/ai'
import { aiPairs, tagPairs, type SuggestedPair, type SuggestionSource } from '../core/graph/suggestedLinks'

interface Entry {
  pairs: SuggestedPair[]
  loading: boolean
}

const EMPTY: SuggestedPair[] = []
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
// The cache Map is mutated in place, so its identity can't be the snapshot —
// useSyncExternalStore would never see a change. Bump a counter instead.
let version = 0

const emit = () => {
  version++
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Identifies a vault snapshot: recompute when notes are added, removed or edited. */
function signature(notes: Note[], links: [string, string][]): string {
  let newest = 0
  for (const n of notes) if (n.updatedAt > newest) newest = n.updatedAt
  return `${notes.length}:${links.length}:${newest}`
}

/** Drop every cached AI pass — e.g. after re-indexing. */
export function clearSuggestedLinks(): void {
  cache.clear()
  emit()
}

/**
 * Suggested pairs for these notes under the chosen source. Tag pairs come back
 * on the first render; AI pairs arrive asynchronously with `loading` true in the
 * meantime, and are reused across views until the vault changes.
 */
export function useSuggestedPairs(
  notes: Note[],
  links: [string, string][],
  source: SuggestionSource,
  /** False skips the work entirely — for callers that only need pairs on demand. */
  enabled = true,
): { pairs: SuggestedPair[]; loading: boolean } {
  const sig = signature(notes, links)
  const key = `ai:${sig}`
  const wantsAi = enabled && source === 'ai'

  useSyncExternalStore(subscribe, () => version, () => version)

  // Tag pairs are pure — no cache needed, and they stay correct as notes change.
  const tags = useMemo(
    () => (enabled && source === 'tags' ? tagPairs(notes, links) : EMPTY),
    // sig stands in for the note/link contents
    [enabled, source, sig],
  )

  useEffect(() => {
    if (!wantsAi || cache.has(key)) return
    let cancelled = false
    cache.set(key, { pairs: EMPTY, loading: true })
    emit()
    // The config lives in SQLite, so it's loaded here rather than threaded
    // through every caller. AI off → no pairs, and the UI says so.
    loadAiConfig()
      .then((config) => (config?.enabled ? aiPairs(notes, links, config) : EMPTY))
      .then((pairs) => {
        if (cancelled) return
        cache.set(key, { pairs, loading: false })
        emit()
      })
      .catch((err) => {
        console.error('[suggestedLinks] AI pass failed:', err)
        if (cancelled) return
        cache.set(key, { pairs: EMPTY, loading: false })
        emit()
      })
    return () => {
      cancelled = true
    }
    // Keyed by the snapshot, not the array identities.
  }, [wantsAi, key])

  if (!enabled) return { pairs: EMPTY, loading: false }
  if (source === 'tags') return { pairs: tags, loading: false }
  return cache.get(key) ?? { pairs: EMPTY, loading: true }
}
