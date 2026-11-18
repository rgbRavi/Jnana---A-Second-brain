// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The trust boundary for user-supplied / stored themes (pasted JSON, the
// localStorage mirror, SQLite rows). Anything that reaches `applyVars` should
// have come through here: the output is a complete, well-typed Theme whose
// tokens are all known, allowlisted values — never an arbitrary CSS property.
// Token grammars are shared with plugin themes (lib/pluginThemes.ts).

import type { Theme, ThemeBase, ThemeDensity, ThemeFonts, ThemeWallpaper } from '../../types'
import { sanitizeTokens } from '../../lib/pluginThemes'
import { cleanFamily } from '../fonts/loadFaces'
import { PRESETS, themeFromPreset } from './presets'
import { DENSITY_SCALE, READING_SCALE_MAX, READING_SCALE_MIN } from './tokens'

export const MAX_THEME_JSON = 64 * 1024
export const MAX_THEME_NAME = 80

const WALLPAPER_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:png|jpe?g|webp|avif|gif|bmp)$/i
const FITS = ['cover', 'contain', 'tile'] as const

function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
}

function sanitizeWallpaper(input: unknown): ThemeWallpaper | null {
  if (!input || typeof input !== 'object') return null
  const w = input as Record<string, unknown>
  if (typeof w.asset !== 'string' || !WALLPAPER_FILE.test(w.asset) || w.asset.includes('..')) return null
  const out: ThemeWallpaper = { asset: w.asset }
  if (FITS.includes(w.fit as (typeof FITS)[number])) out.fit = w.fit as ThemeWallpaper['fit']
  if (w.dim !== undefined) out.dim = num(w.dim, 0, 1, 0.4)
  if (w.blur !== undefined) out.blur = num(w.blur, 0, 40, 0)
  return out
}

function sanitizeFonts(input: unknown, fallback: ThemeFonts): ThemeFonts {
  const f = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const pick = (role: keyof ThemeFonts) => {
    const v = typeof f[role] === 'string' ? cleanFamily(f[role] as string).slice(0, 64) : ''
    return v || fallback[role]
  }
  return { body: pick('body'), mono: pick('mono'), reading: pick('reading') }
}

/**
 * Validate an unknown value (object or JSON string) into a full Theme, or `null`
 * if it isn't recognisably a theme. Unknown keys / bad values are dropped and
 * replaced by the matching preset's defaults; it never throws.
 */
export function sanitizeUserTheme(input: unknown): Theme | null {
  try {
    let obj = input
    if (typeof input === 'string') {
      if (input.length > MAX_THEME_JSON) return null
      obj = JSON.parse(input)
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
    if (JSON.stringify(obj).length > MAX_THEME_JSON) return null
    const o = obj as Record<string, unknown>
    // `{}` or `{"foo":1}` isn't a theme — don't silently reset to defaults.
    if (!(o.tokens && typeof o.tokens === 'object') && o.base !== 'dark' && o.base !== 'light') return null

    const base: ThemeBase = o.base === 'light' ? 'light' : 'dark'
    const dflt = themeFromPreset(base === 'light' ? 'light' : 'dark')
    const name = typeof o.name === 'string' ? o.name.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, MAX_THEME_NAME) : ''
    const presetId = typeof o.presetId === 'string' && PRESETS.some((p) => p.id === o.presetId) ? o.presetId : null
    const density: ThemeDensity =
      typeof o.density === 'string' && Object.prototype.hasOwnProperty.call(DENSITY_SCALE, o.density)
        ? (o.density as ThemeDensity)
        : dflt.density
    const theme: Theme = {
      name: name || 'Imported theme',
      presetId,
      base,
      tokens: { ...dflt.tokens, ...sanitizeTokens(o.tokens) },
      fonts: sanitizeFonts(o.fonts, dflt.fonts),
      density,
      readingScale: num(o.readingScale, READING_SCALE_MIN, READING_SCALE_MAX, dflt.readingScale),
    }
    if (typeof o.glassEffects === 'boolean') theme.glassEffects = o.glassEffects
    const wallpaper = sanitizeWallpaper(o.wallpaper)
    if (wallpaper) theme.wallpaper = wallpaper
    return theme
  } catch {
    return null
  }
}

/** Content identity of a theme (name excluded) — "is this saved theme what's
 *  active right now?", robust to duplicate names, edits and restarts. */
export function themeFingerprint(t: Theme): string {
  return JSON.stringify([
    t.base,
    Object.entries(t.tokens).sort(([a], [b]) => (a < b ? -1 : 1)),
    t.fonts.body, t.fonts.mono, t.fonts.reading,
    t.density,
    t.readingScale,
    !!t.glassEffects,
    t.wallpaper ?? null,
  ])
}
