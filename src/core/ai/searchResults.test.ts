// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { rankHits } from './searchResults'
import type { Note, RetrievalHit } from '../../types'

function note(id: string): Note {
  return { id, title: `T-${id}`, content: '', tags: [], createdAt: 0, updatedAt: 0 } as Note
}

const hit = (noteId: string, score: number, chunkText: string): RetrievalHit => ({
  noteId,
  chunkIndex: 0,
  chunkText,
  score,
})

describe('rankHits', () => {
  it('dedupes by note, keeping the highest-scoring chunk', () => {
    const notes = [note('a')]
    const out = rankHits([hit('a', 0.4, 'Ttl\n\nlow'), hit('a', 0.9, 'Ttl\n\nhigh')], notes)
    expect(out).toHaveLength(1)
    expect(out[0].score).toBeCloseTo(0.9)
    expect(out[0].snippet).toBe('high')
  })

  it('drops hits whose note is not in the provided (scoped) set', () => {
    const out = rankHits([hit('a', 0.9, 'x'), hit('ghost', 0.99, 'y')], [note('a')])
    expect(out.map((r) => r.note.id)).toEqual(['a'])
  })

  it('sorts by score descending', () => {
    const notes = [note('a'), note('b')]
    const out = rankHits([hit('a', 0.3, 'x'), hit('b', 0.7, 'y')], notes)
    expect(out.map((r) => r.note.id)).toEqual(['b', 'a'])
  })

  it('strips the prepended title line from the snippet', () => {
    const out = rankHits([hit('a', 0.5, 'My Title\n\nthe body text')], [note('a')])
    expect(out[0].snippet).toBe('the body text')
  })
})
