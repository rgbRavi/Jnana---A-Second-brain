// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Candidate [[wikilinks]] the vault doesn't have yet: pairs of notes that look
// related but aren't linked either way. The dashboard counts them; the graph
// draws them as dashed lines you can click to connect. Both read the same
// pairs through lib/suggestedLinks, so the tile's number always matches the
// lines on screen.
//
// Two sources, picked by the user in Settings → Dashboard:
//   tags — shared user tag. Synchronous, works with AI off.
//   ai   — semantic neighbours from the local vector index. Needs AI enabled
//          and an index; bounded below so a big vault can't melt.

import type { AiConfig, Note } from '../../types'
import { isAutoTag } from '../tags'
import { retrieve } from '../ai/rag'

export type SuggestionSource = 'tags' | 'ai'

export interface SuggestedPair {
  /** Note ids, always ordered a < b so a pair has one identity. */
  a: string
  b: string
  /** Why it was suggested — shown in the connect prompt. */
  reason: string
}

/** A tag shared by more notes than this is too generic to mean anything. */
const MAX_TAG_FANOUT = 25
/** Notes scanned per AI pass, most-recently-updated first. */
const AI_NOTE_BUDGET = 150
/** Concurrent retrievals — the embedding provider may be a remote HTTP call. */
const AI_CONCURRENCY = 4
/** Neighbours pulled per note before filtering. */
const AI_TOP_K = 6
/** Lines the graph will draw at most, for either source. */
export const MAX_PAIRS = 100

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

const orderedPair = (a: string, b: string, reason: string): SuggestedPair =>
  a < b ? { a, b, reason } : { a: b, b: a, reason }

/** Pair keys for every existing edge, in both directions. */
export function linkedKeys(links: [string, string][]): Set<string> {
  const set = new Set<string>()
  for (const [from, to] of links) set.add(pairKey(from, to))
  return set
}

/**
 * Unlinked pairs of notes sharing a user tag. Auto-tags (`has:image`, …) are
 * ignored — they describe a note's media, not its subject — as are tags carried
 * by more than MAX_TAG_FANOUT notes, which would suggest every pair under a
 * catch-all like "notes".
 */
export function tagPairs(notes: Note[], links: [string, string][]): SuggestedPair[] {
  const linked = linkedKeys(links)
  const byTag = new Map<string, string[]>()
  for (const n of notes) {
    for (const t of n.tags) {
      if (isAutoTag(t)) continue
      const arr = byTag.get(t)
      if (arr) arr.push(n.id)
      else byTag.set(t, [n.id])
    }
  }

  const seen = new Set<string>()
  const out: SuggestedPair[] = []
  for (const [tag, ids] of byTag) {
    if (ids.length < 2 || ids.length > MAX_TAG_FANOUT) continue
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i], ids[j])
        if (linked.has(key) || seen.has(key)) continue
        seen.add(key)
        out.push(orderedPair(ids[i], ids[j], `both tagged #${tag}`))
      }
    }
  }
  return out
}

/**
 * Unlinked pairs whose text is semantically close, via the local vector index.
 * Each scanned note contributes its nearest neighbours; a pair found from both
 * ends is kept once. Requires notes to be indexed — an empty index yields an
 * empty list rather than an error.
 */
export async function aiPairs(
  notes: Note[],
  links: [string, string][],
  config: AiConfig,
): Promise<SuggestedPair[]> {
  const linked = linkedKeys(links)
  const live = new Set(notes.map((n) => n.id))
  const budget = [...notes]
    .filter((n) => (n.content ?? '').trim().length > 0)
    .sort((x, y) => y.updatedAt - x.updatedAt)
    .slice(0, AI_NOTE_BUDGET)

  const seen = new Set<string>()
  const out: SuggestedPair[] = []
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (cursor < budget.length && out.length < MAX_PAIRS) {
      const note = budget[cursor++]
      const query = `${note.title ?? ''}\n${note.content ?? ''}`.trim().slice(0, 4000)
      if (!query) continue
      let hits
      try {
        hits = await retrieve(query, config, AI_TOP_K)
      } catch {
        // One bad embedding call shouldn't kill the whole pass.
        continue
      }
      for (const hit of hits) {
        if (hit.noteId === note.id || !live.has(hit.noteId)) continue
        const key = pairKey(note.id, hit.noteId)
        if (linked.has(key) || seen.has(key)) continue
        seen.add(key)
        out.push(orderedPair(note.id, hit.noteId, `${Math.round(hit.score * 100)}% similar text`))
        if (out.length >= MAX_PAIRS) return
      }
    }
  }

  await Promise.all(Array.from({ length: AI_CONCURRENCY }, worker))
  return out
}

export interface Point {
  x: number
  y: number
}

/** Shortest distance from `p` to the segment a–b (0 when the segment is a point). */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  // Degenerate segment (both endpoints stacked) — fall back to point distance.
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return Math.hypot(p.x - cx, p.y - cy)
}

/**
 * The suggested pair whose drawn line passes closest to `point`, or null if none
 * comes within `maxDist`. `positionOf` resolves a note id to where the graph has
 * it right now; pairs with an unplaced end are skipped.
 */
export function nearestPair(
  pairs: SuggestedPair[],
  positionOf: (id: string) => Point | undefined,
  point: Point,
  maxDist: number,
): SuggestedPair | null {
  let best: SuggestedPair | null = null
  let bestDist = maxDist
  for (const pair of pairs) {
    const a = positionOf(pair.a)
    const b = positionOf(pair.b)
    if (!a || !b) continue
    const d = distanceToSegment(point, a, b)
    if (d <= bestDist) {
      bestDist = d
      best = pair
    }
  }
  return best
}
