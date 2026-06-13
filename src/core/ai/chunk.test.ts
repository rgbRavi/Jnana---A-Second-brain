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
})
