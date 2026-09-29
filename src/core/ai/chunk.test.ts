// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { chunkNote } from './chunk'
import type { Note } from '../../types'

function makeNote(content: string, title = 'My Note'): Note {
  return {
    id: 'n1',
    title,
    content,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('chunkNote', () => {
  it('returns no chunks for empty / embed-only content', () => {
    expect(chunkNote(makeNote(''))).toEqual([])
    expect(chunkNote(makeNote('![img](jnana-asset://x.png)'))).toEqual([])
  })

  it('prepends the title to every chunk', () => {
    const chunks = chunkNote(makeNote('Some real text about vectors.'))
    expect(chunks.length).toBe(1)
    expect(chunks[0].chunkText.startsWith('My Note\n\n')).toBe(true)
    expect(chunks[0].chunkText).toContain('vectors')
  })

  it('strips embeds/markers but keeps human-readable text', () => {
    const content =
      '![img](jnana-asset://x.png)\n\nSee [[Other Note]] and ' +
      '[External: doc](external://%2Fpath) at [V0::01:23].'
    const text = chunkNote(makeNote(content))[0].chunkText

    expect(text).toContain('Other Note') // wikilink target kept
    expect(text).toContain('External: doc') // external-link label kept
    expect(text).not.toContain('jnana-asset') // embed url dropped
    expect(text).not.toContain('[[') // wikilink syntax dropped
    expect(text).not.toContain('[V0') // timestamp marker dropped
  })

  it('hard-splits an oversized paragraph into overlapping chunks', () => {
    const chunks = chunkNote(makeNote('a'.repeat(2500)))
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i)
      expect(c.chunkText.startsWith('My Note\n\n')).toBe(true)
    })
  })

  it('includes extra attachment text in the chunked output', () => {
    const note = { id: 'n1', title: 'Doc', content: 'body one', tags: [], createdAt: 0, updatedAt: 0 } as Note
    const chunks = chunkNote(note, 'text pulled from a pdf about photosynthesis')
    const all = chunks.map((c) => c.chunkText).join('\n')
    expect(all).toContain('photosynthesis')
  })
})

describe('surrogate pairs (astral characters)', () => {
  // U+1D434 MATHEMATICAL ITALIC CAPITAL A — two UTF-16 code units, and exactly
  // what a maths PDF's extracted text is full of.
  const MATH_A = '𝐴'

  const hasLoneSurrogate = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c >= 0xd800 && c <= 0xdbff) {
        const next = s.charCodeAt(i + 1)
        if (!(next >= 0xdc00 && next <= 0xdfff)) return true
        i++
      } else if (c >= 0xdc00 && c <= 0xdfff) {
        return true
      }
    }
    return false
  }

  it('never splits a pair across chunk boundaries', () => {
    // One long paragraph of astral characters forces the hard-split path. The
    // odd-length prefix matters: it pushes every pair onto an odd index, so the
    // fixed-width cut lands *between* the two halves. Every chunk must still be
    // encodable.
    const para = 'x' + MATH_A.repeat(4000)
    const chunks = chunkNote(makeNote(para))
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(hasLoneSurrogate(c.chunkText)).toBe(false)
      // JSON.stringify is what the IPC layer runs; the round trip must survive.
      expect(() => JSON.parse(JSON.stringify(c.chunkText))).not.toThrow()
    }
  })

  it('keeps the characters themselves intact', () => {
    const chunks = chunkNote(makeNote(`before ${MATH_A} after`))
    expect(chunks[0].chunkText).toContain(MATH_A)
  })

  it('replaces a surrogate that arrives already unpaired', () => {
    // Half a pair, as a broken PDF extractor can emit.
    const chunks = chunkNote(makeNote(`text \uD835 more text`))
    expect(hasLoneSurrogate(chunks[0].chunkText)).toBe(false)
    expect(chunks[0].chunkText).toContain('�')
  })
})
