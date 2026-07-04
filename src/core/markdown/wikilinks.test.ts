import { describe, it, expect } from 'vitest'
import {
  detectWikilinkContext,
  extractWikilinkTitles,
  normalizeTitle,
  pseudoNodeId,
  resolveNoteByTitle,
} from './wikilinks'

describe('extractWikilinkTitles', () => {
  it('pulls trimmed titles and drops empties', () => {
    expect(extractWikilinkTitles('see [[ Alpha ]] and [[Beta]] plus [[]]')).toEqual(['Alpha', 'Beta'])
  })
})

describe('resolveNoteByTitle', () => {
  const notes = [{ id: '1', title: 'Alpha' }, { id: '2', title: 'Beta Note' }]
  it('matches case-insensitively', () => {
    expect(resolveNoteByTitle('alpha', notes)?.id).toBe('1')
    expect(resolveNoteByTitle('BETA note', notes)?.id).toBe('2')
  })
  it('returns undefined for an unresolved title', () => {
    expect(resolveNoteByTitle('Gamma', notes)).toBeUndefined()
  })
})

describe('pseudoNodeId', () => {
  it('is stable and normalized', () => {
    expect(pseudoNodeId(' New Idea ')).toBe('pseudo:new idea')
    expect(pseudoNodeId('New Idea')).toBe(pseudoNodeId('new idea'))
  })
})

describe('normalizeTitle', () => {
  it('trims and lowercases', () => {
    expect(normalizeTitle('  Foo Bar ')).toBe('foo bar')
  })
})

describe('detectWikilinkContext', () => {
  it('opens with an empty query right after [[', () => {
    expect(detectWikilinkContext('[[', 2)).toEqual({ contentStart: 2, query: '', hasClose: false })
  })

  it('opens inside [[]] and flags the trailing close', () => {
    expect(detectWikilinkContext('[[]]', 2)).toEqual({ contentStart: 2, query: '', hasClose: true })
  })

  it('captures the query typed after [[', () => {
    const doc = 'note body [[foo'
    expect(detectWikilinkContext(doc, doc.length)).toEqual({ contentStart: 12, query: 'foo', hasClose: false })
  })

  it('uses the nearest open bracket when several exist', () => {
    const doc = '[[a]] [[b'
    expect(detectWikilinkContext(doc, doc.length)).toEqual({ contentStart: 8, query: 'b', hasClose: false })
  })

  it('does not re-trigger on a finished [[Foo]]', () => {
    const doc = '[[Foo]]'
    expect(detectWikilinkContext(doc, doc.length)).toBeNull()
  })

  it('rejects a query spanning a newline', () => {
    const doc = '[[foo\nbar'
    expect(detectWikilinkContext(doc, doc.length)).toBeNull()
  })

  it('returns null with no open bracket', () => {
    expect(detectWikilinkContext('plain text', 10)).toBeNull()
  })
})
