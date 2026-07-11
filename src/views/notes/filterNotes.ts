// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure filtering / sorting helpers for the Notes view. No React, no IO — every
// input (notes, favourites, link counts) is supplied by the caller so this stays
// trivially testable. All filter dimensions are derived from data already loaded
// in bulk: note fields, the `has:*` / `long-form` auto-tags baked into note.tags
// (see core/tags.ts), the favourites set, and the link graph.

import type { Note } from '../../types'

export type DisplayMode = 'card' | 'compact' | 'grid' | 'comfortable'
export type SortBy = 'updated' | 'created' | 'title' | 'length' | 'links'
export type SortOrder = 'asc' | 'desc'
export type DatePreset = 'all' | 'today' | '7d' | '30d' | 'month' | 'custom'
export type SizeBucket = 'short' | 'medium' | 'long'
export type StatusFilter =
  | 'fav'
  | 'images'
  | 'pdfs'
  | 'videos'
  | 'audio'
  | 'docs'
  | 'webpages'
  | 'linked'
  | 'orphan'

export interface NotesFilter {
  datePreset: DatePreset
  /** Custom-range bounds (ms); only used when datePreset === 'custom'. */
  dateFrom?: number
  dateTo?: number
  sizes: SizeBucket[]
  includeTags: string[]
  excludeTags: string[]
  status: StatusFilter[]
}

export const EMPTY_FILTER: NotesFilter = {
  datePreset: 'all',
  sizes: [],
  includeTags: [],
  excludeTags: [],
  status: [],
}

const DAY_MS = 86_400_000

/** Word count — same tokenization as inferTags' long-form check (core/tags.ts). */
export function wordCount(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length
}

/** Estimated reading time in minutes (~200 wpm), at least 1. */
export function readingMinutes(content: string): number {
  return Math.max(1, Math.round(wordCount(content) / 200))
}

/** Short < 250, Medium 250–1000, Long > 1000 words (matches the long-form auto-tag). */
export function sizeBucket(content: string): SizeBucket {
  const w = wordCount(content)
  if (w < 250) return 'short'
  if (w > 1000) return 'long'
  return 'medium'
}

/** Build a per-note total degree (inbound + outbound) map from edge pairs. */
export function buildLinkCounts(edges: [string, string][]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const [from, to] of edges) {
    counts.set(from, (counts.get(from) ?? 0) + 1)
    counts.set(to, (counts.get(to) ?? 0) + 1)
  }
  return counts
}

/** Resolve a filter's date preset to inclusive [from, to] ms bounds, or null for "all". */
export function dateRange(filter: NotesFilter, now: number = Date.now()): [number, number] | null {
  switch (filter.datePreset) {
    case 'all':
      return null
    case 'today': {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return [start.getTime(), now]
    }
    case '7d':
      return [now - 7 * DAY_MS, now]
    case '30d':
      return [now - 30 * DAY_MS, now]
    case 'month': {
      const d = new Date(now)
      return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), now]
    }
    case 'custom':
      return [filter.dateFrom ?? 0, filter.dateTo ?? now]
  }
}

/** Status filter → the auto-tag that proves it (the rest are computed). */
const STATUS_TAG: Partial<Record<StatusFilter, string>> = {
  images: 'has:image',
  pdfs: 'has:pdf',
  videos: 'has:videoOrYt',
  audio: 'has:audio',
  docs: 'has:docxlink',
  webpages: 'has:webpage',
}

export function applyFilters(
  notes: Note[],
  filter: NotesFilter,
  search: string,
  favSet: Set<string>,
  linkCounts: Map<string, number>,
): Note[] {
  const q = search.trim().toLowerCase()
  const range = dateRange(filter)

  return notes.filter((n) => {
    // Search: title + content + tags, case-insensitive substring.
    if (q) {
      const hay = `${n.title}\n${n.content}\n${n.tags.join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }

    // Date (against updatedAt).
    if (range && (n.updatedAt < range[0] || n.updatedAt > range[1])) return false

    // Size buckets (any of the selected).
    if (filter.sizes.length && !filter.sizes.includes(sizeBucket(n.content))) return false

    // Include tags: note must carry at least one selected tag.
    if (filter.includeTags.length && !filter.includeTags.some((t) => n.tags.includes(t))) return false

    // Exclude tags: note must carry none of them.
    if (filter.excludeTags.length && filter.excludeTags.some((t) => n.tags.includes(t))) return false

    // Status: every selected status must hold (AND).
    for (const s of filter.status) {
      if (s === 'fav') {
        if (!favSet.has(n.id)) return false
        continue
      }
      if (s === 'linked') {
        if ((linkCounts.get(n.id) ?? 0) === 0) return false
        continue
      }
      if (s === 'orphan') {
        if ((linkCounts.get(n.id) ?? 0) !== 0) return false
        continue
      }
      const tag = STATUS_TAG[s]
      if (tag && !n.tags.includes(tag)) return false
    }

    return true
  })
}

export function sortNotes(
  notes: Note[],
  sortBy: SortBy,
  order: SortOrder,
  linkCounts: Map<string, number>,
): Note[] {
  const dir = order === 'asc' ? 1 : -1
  return [...notes].sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return dir * a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      case 'created':
        return dir * (a.createdAt - b.createdAt)
      case 'length':
        return dir * (wordCount(a.content) - wordCount(b.content))
      case 'links':
        return dir * ((linkCounts.get(a.id) ?? 0) - (linkCounts.get(b.id) ?? 0))
      case 'updated':
      default:
        return dir * (a.updatedAt - b.updatedAt)
    }
  })
}
