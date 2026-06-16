import { describe, it, expect } from 'vitest'
import type { Note } from '../../types'
import {
  applyFilters,
  buildLinkCounts,
  dateRange,
  EMPTY_FILTER,
  sizeBucket,
  sortNotes,
  wordCount,
  type NotesFilter,
} from './filterNotes'

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    title: overrides.title ?? '',
    content: overrides.content ?? '',
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
  }
}

const words = (n: number) => Array(n).fill('word').join(' ')
const filter = (patch: Partial<NotesFilter> = {}): NotesFilter => ({ ...EMPTY_FILTER, ...patch })
const noLinks = new Map<string, number>()
const noFavs = new Set<string>()

describe('filterNotes', () => {
  describe('wordCount / sizeBucket', () => {
    it('counts words, collapsing whitespace', () => {
      expect(wordCount('  hello   world\n\nfoo ')).toBe(3)
      expect(wordCount('')).toBe(0)
    })

    it('buckets by word count (short <250, long >1000)', () => {
      expect(sizeBucket(words(100))).toBe('short')
      expect(sizeBucket(words(500))).toBe('medium')
      expect(sizeBucket(words(1500))).toBe('long')
    })
  })

  describe('applyFilters', () => {
    const notes = [
      note({ id: 'a', title: 'Rust notes', content: 'memory safety', tags: ['lang', 'has:pdf'] }),
      note({ id: 'b', title: 'Cooking', content: 'pasta recipe', tags: ['food'] }),
      note({ id: 'c', title: 'Travel', content: 'Japan trip', tags: ['has:image'] }),
    ]

    it('searches title, content and tags', () => {
      expect(applyFilters(notes, filter(), 'rust', noFavs, noLinks).map((n) => n.id)).toEqual(['a'])
      expect(applyFilters(notes, filter(), 'recipe', noFavs, noLinks).map((n) => n.id)).toEqual(['b'])
      expect(applyFilters(notes, filter(), 'food', noFavs, noLinks).map((n) => n.id)).toEqual(['b'])
    })

    it('includes notes carrying any include-tag, excludes exclude-tags', () => {
      expect(applyFilters(notes, filter({ includeTags: ['food'] }), '', noFavs, noLinks).map((n) => n.id)).toEqual(['b'])
      expect(applyFilters(notes, filter({ excludeTags: ['food'] }), '', noFavs, noLinks).map((n) => n.id)).toEqual([
        'a',
        'c',
      ])
    })

    it('maps status filters to auto-tags and favourites', () => {
      expect(applyFilters(notes, filter({ status: ['pdfs'] }), '', noFavs, noLinks).map((n) => n.id)).toEqual(['a'])
      expect(applyFilters(notes, filter({ status: ['images'] }), '', noFavs, noLinks).map((n) => n.id)).toEqual(['c'])
      const favs = new Set(['b'])
      expect(applyFilters(notes, filter({ status: ['fav'] }), '', favs, noLinks).map((n) => n.id)).toEqual(['b'])
    })

    it('distinguishes linked from orphan notes', () => {
      const counts = buildLinkCounts([['a', 'b']])
      expect(applyFilters(notes, filter({ status: ['linked'] }), '', noFavs, counts).map((n) => n.id)).toEqual([
        'a',
        'b',
      ])
      expect(applyFilters(notes, filter({ status: ['orphan'] }), '', noFavs, counts).map((n) => n.id)).toEqual(['c'])
    })

    it('filters by size bucket', () => {
      const sized = [
        note({ id: 'short', content: words(10) }),
        note({ id: 'long', content: words(1200) }),
      ]
      expect(applyFilters(sized, filter({ sizes: ['long'] }), '', noFavs, noLinks).map((n) => n.id)).toEqual(['long'])
    })
  })

  describe('dateRange', () => {
    it('returns null for "all" and a window for presets', () => {
      const now = Date.UTC(2026, 0, 15, 12)
      expect(dateRange(filter(), now)).toBeNull()
      const range = dateRange(filter({ datePreset: '7d' }), now)
      expect(range).not.toBeNull()
      expect(range![1]).toBe(now)
      expect(range![0]).toBe(now - 7 * 86_400_000)
    })
  })

  describe('sortNotes', () => {
    const notes = [
      note({ id: 'a', title: 'Beta', content: words(10), updatedAt: 100, createdAt: 1 }),
      note({ id: 'b', title: 'Alpha', content: words(50), updatedAt: 300, createdAt: 2 }),
      note({ id: 'c', title: 'Gamma', content: words(30), updatedAt: 200, createdAt: 3 }),
    ]

    it('sorts by updated desc by default order', () => {
      expect(sortNotes(notes, 'updated', 'desc', noLinks).map((n) => n.id)).toEqual(['b', 'c', 'a'])
    })

    it('sorts by title ascending', () => {
      expect(sortNotes(notes, 'title', 'asc', noLinks).map((n) => n.id)).toEqual(['b', 'a', 'c'])
    })

    it('sorts by length (word count)', () => {
      expect(sortNotes(notes, 'length', 'asc', noLinks).map((n) => n.id)).toEqual(['a', 'c', 'b'])
    })

    it('sorts by link count', () => {
      const counts = buildLinkCounts([
        ['b', 'a'],
        ['b', 'c'],
      ])
      // b has degree 2, a and c degree 1, others 0
      expect(sortNotes(notes, 'links', 'desc', counts)[0].id).toBe('b')
    })
  })
})
