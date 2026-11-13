// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import { parseLinks } from './links'

describe('parseLinks', () => {
  it('keeps http(s), dedupes and caps at 10', () => {
    expect(parseLinks('https://a.example/x, http://b.example ftp://c.example notaurl\nhttps://a.example/x')).toEqual([
      'https://a.example/x',
      'http://b.example/',
    ])
    const many = Array.from({ length: 12 }, (_, i) => `https://e.example/${i}`).join(' ')
    expect(parseLinks(many)).toHaveLength(10)
  })

  it('keeps commas inside a URL and trims surrounding punctuation', () => {
    expect(
      parseLinks('See https://en.wikipedia.org/wiki/Washington,_D.C (and <https://b.example/y>) or https://en.wikipedia.org/wiki/Python_(programming_language).'),
    ).toEqual([
      'https://en.wikipedia.org/wiki/Washington,_D.C',
      'https://b.example/y',
      'https://en.wikipedia.org/wiki/Python_(programming_language)',
    ])
  })
})
