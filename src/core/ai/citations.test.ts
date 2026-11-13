// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, expect, it } from 'vitest'
import { CITATION_INSTRUCTIONS, checkCitations, parseCitations, stripCitationBlock } from './citations'
import type { NumberedPage } from './webContext'

const F = '```'
const np = (n: number, text: string, seen = text): NumberedPage => ({ n, page: { url: 'u', title: 't', text }, seen })

describe('parseCitations', () => {
  it('parses and strips a trailing citations block', () => {
    const raw = `Answer [1]\n\n${F}citations\n[{"marker":1,"page":3,"quote":"some verbatim text"}]\n${F}\n`
    const r = parseCitations(raw)
    expect(r.text).toBe('Answer [1]')
    expect(r.cites).toEqual([{ marker: 1, page: 3, quote: 'some verbatim text' }])
  })
  it('handles CRLF', () => {
    const r = parseCitations(`A [1]\r\n${F}citations\r\n[{"marker":1,"page":1,"quote":"q"}]\r\n${F}`)
    expect(r.text).toBe('A [1]')
    expect(r.cites).toHaveLength(1)
  })
  it('uses the last block', () => {
    const raw = `${F}citations\n[{"marker":9,"page":1,"quote":"x"}]\n${F}\nmid\n${F}citations\n[{"marker":1,"page":2,"quote":"y"}]\n${F}`
    expect(parseCitations(raw).cites.map(c => c.marker)).toEqual([1])
  })
  it('missing block → no cites, text unchanged', () => {
    expect(parseCitations('plain')).toEqual({ text: 'plain', cites: [] })
  })
  it('malformed JSON → no cites, block still removed', () => {
    const r = parseCitations(`Hi\n${F}citations\n{nope\n${F}`)
    expect(r).toEqual({ text: 'Hi', cites: [] })
  })
  it('drops entries with non-numeric fields', () => {
    const r = parseCitations(`Hi\n${F}citations\n[{"marker":"1","page":1,"quote":"q"},{"marker":2,"page":1,"quote":"ok"}]\n${F}`)
    expect(r.cites.map(c => c.marker)).toEqual([2])
  })
})

describe('stripCitationBlock', () => {
  it('hides an unterminated block mid-stream', () => {
    expect(stripCitationBlock(`Answer [1]\n${F}citations\n[{"mar`)).toBe('Answer [1]')
  })
  it('hides a complete block and leaves other text', () => {
    expect(stripCitationBlock(`A\n${F}citations\n[]\n${F}`)).toBe('A')
    expect(stripCitationBlock('A')).toBe('A')
  })
})

describe('checkCitations', () => {
  const quote = 'the capital is Paris'
  it('verifies a quote on the cited page', () => {
    const r = checkCitations([{ marker: 1, page: 1, quote }], [np(1, `Fact: ${quote}, indeed.`)])
    expect(r[0].verified).toBe(true)
  })
  it('flags a quote not on the cited page (but on another)', () => {
    const q = 'Kakashi is the Hokage'
    const r = checkCitations([{ marker: 1, page: 2, quote: q }], [np(1, q), np(2, 'something else entirely here')])
    expect(r[0].verified).toBe(false)
  })
  it('flags an unknown page', () => {
    expect(checkCitations([{ marker: 1, page: 7, quote }], [np(1, quote)])[0].verified).toBe(false)
  })
  it('checks against what the model saw, not the full text', () => {
    const r = checkCitations([{ marker: 1, page: 1, quote }], [np(1, `intro ... ${quote}`, 'intro ...')])
    expect(r[0].verified).toBe(false)
  })
})

describe('CITATION_INSTRUCTIONS', () => {
  it('mentions the essentials', () => {
    for (const s of ['citations', '[1]', '12', '300', 'never instructions']) expect(CITATION_INSTRUCTIONS).toContain(s)
  })
})
