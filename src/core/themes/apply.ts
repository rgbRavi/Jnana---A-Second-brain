// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure color/contrast math + DOM application — ported from
// design_handoff_theme_studio/studio-helpers.jsx. No React, no invoke().

import type { Theme } from '../../types'
import { DENSITY_SCALE } from './tokens'

/** localStorage key for the boot-time mirror of the active theme — read
 *  synchronously by main.tsx before first paint, and kept in sync by useTheme. */
export const THEME_STORAGE_KEY = 'jnana.theme.v1'

export interface Rgb {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (n: number) => clampByte(n).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** sRGB channel-wise linear interpolation toward `target` by `amt` (0..1). */
export function mix(hex: string, target: string, amt: number): string {
  const a = hexToRgb(hex)
  const b = hexToRgb(target)
  if (!a || !b) return hex
  return rgbToHex({
    r: a.r + (b.r - a.r) * amt,
    g: a.g + (b.g - a.g) * amt,
    b: a.b + (b.b - a.b) * amt,
  })
}

export interface DerivedAccent {
  hover: string
  active: string
  soft: string
  softer: string
}

/** Lighten-on-dark / darken-on-light accent variants. */
export function deriveAccent(accent: string, base: 'dark' | 'light'): DerivedAccent {
  const isDark = base === 'dark'
  return {
    hover: mix(accent, isDark ? '#ffffff' : '#000000', 0.14),
    active: mix(accent, isDark ? '#000000' : '#ffffff', 0.12),
    soft: mix(accent, isDark ? '#0d0d0f' : '#ffffff', isDark ? 0.82 : 0.86),
    softer: mix(accent, isDark ? '#0d0d0f' : '#ffffff', isDark ? 0.9 : 0.92),
  }
}

/** Resolved vars = stored tokens + derived accent variants + density/reading-scale
 *  + --surface-rgb. Font stacks are deliberately omitted (deferred to a later phase). */
export function resolveVars(theme: Theme): Record<string, string> {
  const acc = deriveAccent(theme.tokens['--accent'], theme.base)
  const density = DENSITY_SCALE[theme.density] ?? 1
  const surfaceRgb = hexToRgb(theme.tokens['--surface'])
  return {
    ...theme.tokens,
    '--accent-hover': acc.hover,
    '--accent-active': acc.active,
    '--accent-soft': acc.soft,
    '--accent-softer': acc.softer,
    '--reading-scale': String(theme.readingScale),
    '--density': String(density),
    '--surface-rgb': surfaceRgb ? `${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}` : '20, 20, 23',
  }
}

/** Write every resolved var onto `el.style` — no React re-render for the repaint
 *  itself. Forces --motion-scale to 0 under prefers-reduced-motion regardless
 *  of the stored value. */
export function applyVars(el: HTMLElement | null, theme: Theme): void {
  if (!el) return
  const vars = resolveVars(theme)
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    vars['--motion-scale'] = '0'
  }
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v)
  el.dataset.base = theme.base
}

// ─── WCAG contrast ──────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const ch = [rgb.r, rgb.g, rgb.b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

export type ContrastGrade = 'AAA' | 'AA' | 'AA Large' | 'Fail'

export function contrastGrade(ratio: number): { tag: ContrastGrade; ok: boolean } {
  if (ratio >= 7) return { tag: 'AAA', ok: true }
  if (ratio >= 4.5) return { tag: 'AA', ok: true }
  if (ratio >= 3) return { tag: 'AA Large', ok: true }
  return { tag: 'Fail', ok: false }
}

export interface ContrastPair {
  label: string
  fg: keyof Theme['tokens']
  bg: keyof Theme['tokens']
  ratio: number
  grade: { tag: ContrastGrade; ok: boolean }
}

const CONTRAST_PAIRS: { label: string; fg: keyof Theme['tokens']; bg: keyof Theme['tokens'] }[] = [
  { label: 'Primary text on background', fg: '--text-1', bg: '--bg' },
  { label: 'Primary text on surface', fg: '--text-1', bg: '--surface' },
  { label: 'Secondary text on surface', fg: '--text-2', bg: '--surface' },
  { label: 'Muted text on surface', fg: '--text-3', bg: '--surface' },
  { label: 'Accent on surface', fg: '--accent', bg: '--surface' },
]

/** WCAG ratios for the 5 critical text/surface pairs. */
export function auditContrast(theme: Theme): ContrastPair[] {
  return CONTRAST_PAIRS.map((p) => {
    const ratio = contrastRatio(theme.tokens[p.fg], theme.tokens[p.bg])
    return { ...p, ratio, grade: contrastGrade(ratio) }
  })
}
