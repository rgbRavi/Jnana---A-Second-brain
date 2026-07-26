// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeEach } from 'vitest'
import { buildFaceCss, familyStack } from './loadFaces'
import { setInstalledStacks, installedStack } from './registry'
import { resolveVars } from '../themes/apply'
import { themeFromPreset } from '../themes/presets'
import type { InstalledFont } from '../fonts'

const inter: InstalledFont = {
  id: 'a',
  family: 'Inter',
  generic: 'sans',
  faces: [
    { src: 'data:font/woff2;base64,AAAA', weight: 400, italic: false },
    { src: 'data:font/woff2;base64,BBBB', weight: 700, italic: false },
    { src: 'data:font/ttf;base64,CCCC', weight: 400, italic: true },
  ],
}

describe('loadFaces', () => {
  describe('familyStack', () => {
    it('quotes the family and appends the generic fallback', () => {
      expect(familyStack(inter)).toBe("'Inter', sans-serif")
      expect(familyStack({ ...inter, generic: 'serif' })).toBe("'Inter', serif")
      expect(familyStack({ ...inter, generic: 'mono' })).toBe("'Inter', monospace")
    })
  })

  describe('buildFaceCss', () => {
    it('emits one @font-face per face with weight/style/format', () => {
      const css = buildFaceCss([inter])
      expect(css.match(/@font-face/g)).toHaveLength(3)
      expect(css).toContain("font-family: 'Inter'")
      expect(css).toContain('font-weight: 700')
      expect(css).toContain('font-style: italic')
      expect(css).toContain("src: url('data:font/woff2;base64,AAAA')")
      expect(css).toContain("src: url('data:font/ttf;base64,CCCC')")
    })

    it('is empty for no fonts', () => {
      expect(buildFaceCss([])).toBe('')
    })
  })
})

describe('installed-font resolution', () => {
  beforeEach(() => setInstalledStacks([]))

  it('registry returns undefined for an unknown family', () => {
    expect(installedStack('Nope')).toBeUndefined()
  })

  it('resolveVars maps a Theme.fonts family to --font-* once registered', () => {
    setInstalledStacks([inter])
    const theme = { ...themeFromPreset('dark'), fonts: { body: 'Inter', mono: 'DM Mono', reading: 'Newsreader' } }
    const vars = resolveVars(theme)
    expect(vars['--font-body']).toBe("'Inter', sans-serif")
    // built-ins still resolve from the catalog
    expect(vars['--font-mono']).toContain('DM Mono')
  })

  it('falls back to the role default for an uninstalled family', () => {
    const theme = { ...themeFromPreset('dark'), fonts: { body: 'Ghost', mono: 'DM Mono', reading: 'Newsreader' } }
    const vars = resolveVars(theme)
    expect(vars['--font-body']).toContain('DM Sans') // role default
  })
})
