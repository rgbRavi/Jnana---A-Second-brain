// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { parseAnalysis } from './analyze'

const valid = {
  summary: 'A short synthesis.',
  keyConcepts: ['vectors', 'norms'],
  openQuestions: ['what is cosine?'],
  weakSpots: [],
}

describe('parseAnalysis', () => {
  it('parses a clean JSON object', () => {
    const r = parseAnalysis(JSON.stringify(valid))
    expect(r.summary).toBe('A short synthesis.')
    expect(r.keyConcepts).toEqual(['vectors', 'norms'])
    expect(r.openQuestions).toEqual(['what is cosine?'])
    expect(r.weakSpots).toEqual([])
  })

  it('tolerates ```json code fences', () => {
    const r = parseAnalysis('```json\n' + JSON.stringify(valid) + '\n```')
    expect(r.summary).toBe('A short synthesis.')
    expect(r.keyConcepts).toEqual(['vectors', 'norms'])
  })

  it('extracts the object from surrounding prose', () => {
    const r = parseAnalysis(`Sure! Here is the analysis: ${JSON.stringify(valid)} Hope that helps.`)
    expect(r.summary).toBe('A short synthesis.')
  })

  it('coerces non-arrays to [] and stringifies list items', () => {
    const r = parseAnalysis(
      JSON.stringify({ summary: 42, keyConcepts: 'not-an-array', openQuestions: [1, 2], weakSpots: null }),
    )
    expect(r.summary).toBe('') // non-string summary → ''
    expect(r.keyConcepts).toEqual([]) // non-array → []
    expect(r.openQuestions).toEqual(['1', '2']) // numbers → strings
    expect(r.weakSpots).toEqual([])
  })

  it('throws on input with no JSON object (caller degrades gracefully)', () => {
    expect(() => parseAnalysis('no json here at all')).toThrow()
  })
})
