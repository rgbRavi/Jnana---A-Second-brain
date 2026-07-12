// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { COLOR_PALETTE, colorAnyTokenRegex, colorTokenRegex, highlightBackground, highlightTokenRegex, resolveColor } from './colors'

describe('resolveColor', () => {
  it('maps a palette name to its curated hex', () => {
    expect(resolveColor('red')).toBe('#e5484d')
    expect(resolveColor('RED')).toBe('#e5484d')
  })

  it('accepts #hex values (3/6/8 digits)', () => {
    expect(resolveColor('#abc')).toBe('#abc')
    expect(resolveColor('#ff0000')).toBe('#ff0000')
    expect(resolveColor('#ff000080')).toBe('#ff000080')
  })

  it('accepts a bare CSS colour word', () => {
    expect(resolveColor('rebeccapurple')).toBe('rebeccapurple')
  })

  it('rejects anything with punctuation/whitespace (CSS-injection guard)', () => {
    expect(resolveColor('red;background:url(x)')).toBeNull()
    expect(resolveColor('#zzzzzz')).toBeNull()
    expect(resolveColor('rgb(1,2,3)')).toBeNull()
    expect(resolveColor('')).toBeNull()
  })

  it('every palette entry resolves to its own hex', () => {
    for (const c of COLOR_PALETTE) expect(resolveColor(c.name)).toBe(c.hex)
  })
})

describe('colorTokenRegex', () => {
  it('captures the colour name and inner text', () => {
    const m = colorTokenRegex().exec('a [c:red]hi[/c] b')
    expect(m?.[1]).toBe('red')
    expect(m?.[2]).toBe('hi')
  })

  it('is non-greedy across two adjacent tokens', () => {
    const re = colorTokenRegex()
    const first = re.exec('[c:red]a[/c][c:blue]b[/c]')
    expect(first?.[2]).toBe('a')
    const second = re.exec('[c:red]a[/c][c:blue]b[/c]')
    expect(second?.[1]).toBe('blue')
    expect(second?.[2]).toBe('b')
  })

  it('does not match without a closing [/c]', () => {
    expect(colorTokenRegex().exec('[c:red]dangling')).toBeNull()
  })
})

describe('highlightTokenRegex', () => {
  it('captures the colour name and inner text of a [h:…] token', () => {
    const m = highlightTokenRegex().exec('a [h:teal]hi[/h] b')
    expect(m?.[1]).toBe('teal')
    expect(m?.[2]).toBe('hi')
  })

  it('does not match a colour token (distinct markers)', () => {
    expect(highlightTokenRegex().exec('[c:red]x[/c]')).toBeNull()
    expect(colorTokenRegex().exec('[h:red]x[/h]')).toBeNull()
  })

  it('does not match without a closing [/h]', () => {
    expect(highlightTokenRegex().exec('[h:red]dangling')).toBeNull()
  })
})

describe('highlightBackground', () => {
  it('wraps a resolved colour in a translucent color-mix', () => {
    expect(highlightBackground('#e5484d')).toBe('color-mix(in srgb, #e5484d 40%, transparent)')
  })
})

describe('colorAnyTokenRegex', () => {
  it('captures the kind, colour, and inner text of either token', () => {
    const c = colorAnyTokenRegex().exec('[c:red]hi[/c]')
    expect([c?.[1], c?.[2], c?.[3]]).toEqual(['c', 'red', 'hi'])
    const h = colorAnyTokenRegex().exec('[h:teal]yo[/h]')
    expect([h?.[1], h?.[2], h?.[3]]).toEqual(['h', 'teal', 'yo'])
  })

  it('matches the OUTERMOST token when the two are nested (backreference)', () => {
    // highlight nested inside a text colour → outer is the colour, inner is raw.
    const outer = colorAnyTokenRegex().exec('[c:red][h:teal]x[/h][/c]')
    expect(outer?.[1]).toBe('c')
    expect(outer?.[3]).toBe('[h:teal]x[/h]')

    // and the other way round.
    const other = colorAnyTokenRegex().exec('[h:teal][c:red]x[/c][/h]')
    expect(other?.[1]).toBe('h')
    expect(other?.[3]).toBe('[c:red]x[/c]')
  })

  it('scans two sibling tokens in sequence', () => {
    const re = colorAnyTokenRegex()
    expect(re.exec('[c:red]a[/c] [h:blue]b[/h]')?.[2]).toBe('red')
    expect(re.exec('[c:red]a[/c] [h:blue]b[/h]')?.[2]).toBe('blue')
  })
})
