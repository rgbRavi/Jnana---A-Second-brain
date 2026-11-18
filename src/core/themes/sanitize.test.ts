// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { MAX_THEME_JSON, sanitizeUserTheme, themeFingerprint } from './sanitize'
import { resolveVars } from './apply'
import { themeFromPreset } from './presets'

describe('sanitizeUserTheme', () => {
  it('round-trips a valid exported theme', () => {
    const t = { ...themeFromPreset('light'), name: 'Mine', presetId: null }
    const out = sanitizeUserTheme(JSON.stringify(t))
    expect(out).toEqual(t)
  })

  it('drops non-`--` and unknown keys, so no arbitrary CSS property survives', () => {
    const out = sanitizeUserTheme({ tokens: { display: 'none', '--evil': '1', '--accent': '#112233' } })!
    expect(out.tokens['--accent']).toBe('#112233')
    expect(Object.keys(out.tokens)).not.toContain('display')
    expect(Object.keys(out.tokens)).not.toContain('--evil')
    expect(Object.keys(resolveVars(out))).not.toContain('display')
  })

  it('rejects bad colours and non-string values, keeping defaults', () => {
    const dflt = themeFromPreset('dark').tokens['--accent']
    for (const bad of [5, 'red', '#7', 'url(x)', null, {}]) {
      expect(sanitizeUserTheme({ tokens: { '--accent': bad } })!.tokens['--accent']).toBe(dflt)
    }
  })

  it('rejects oversized and non-theme input', () => {
    expect(sanitizeUserTheme('x'.repeat(MAX_THEME_JSON + 1))).toBeNull()
    expect(sanitizeUserTheme({ tokens: {}, name: 'x'.repeat(MAX_THEME_JSON) })).toBeNull()
    for (const bad of [null, 3, [], '{}', '{"foo":1}', 'not json']) expect(sanitizeUserTheme(bad)).toBeNull()
  })

  it('clamps numbers, validates enums, cleans fonts, trims the name', () => {
    const out = sanitizeUserTheme({
      base: 'light', name: `  ${'n'.repeat(200)} `, density: 'huge', readingScale: 99,
      fonts: { body: "Evil'; } body{display:none", mono: 5 },
      wallpaper: { asset: 'a.png', dim: 5, blur: -3, fit: 'zoom' },
    })!
    expect(out.name.length).toBe(80)
    expect(out.density).toBe('cozy')
    expect(out.readingScale).toBe(1.4)
    expect(out.fonts.body).not.toMatch(/['";{}]/)
    expect(out.fonts.mono).toBe(themeFromPreset('light').fonts.mono)
    expect(out.wallpaper).toEqual({ asset: 'a.png', dim: 1, blur: 0 })
  })

  it('rejects unsafe wallpaper assets', () => {
    for (const asset of ['a".png', '../x.png', 'http://x/y.png', 'x.svg']) {
      expect(sanitizeUserTheme({ base: 'dark', wallpaper: { asset } })!.wallpaper).toBeUndefined()
    }
  })

  it('fingerprint ignores name but sees edits', () => {
    const a = themeFromPreset('dark')
    expect(themeFingerprint(a)).toBe(themeFingerprint({ ...a, name: 'other' }))
    expect(themeFingerprint(a)).not.toBe(themeFingerprint({ ...a, tokens: { ...a.tokens, '--accent': '#000001' } }))
  })
})
