// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Appearance a plugin can contribute: whole **themes**, and an animated
// **background** behind the app shell.
//
// Both are data, never CSS. That distinction is the whole design. A theme is a
// map of known token names to values that must parse as a colour, a length, a
// duration or an easing — nothing else is accepted, and a plugin cannot reach
// any property the app didn't already intend to theme. The alternative (letting
// plugins ship stylesheets, the way Obsidian does) hands them two things this
// app promises not to give: `background: url(https://…)` is an outbound request
// on every paint, and arbitrary CSS can restyle a consent dialog into saying
// whatever the plugin likes.
//
// So `sanitizeTheme` is the trust boundary, and it is deliberately strict: an
// unknown key or an unparseable value is **dropped**, and a theme that loses
// everything is refused rather than registered empty.

import type { Theme, ThemeBase, ThemeTokens } from '../types'

/** A theme as a plugin declares it. Tokens are partial — whatever it leaves out
 *  comes from the matching built-in preset, so a two-token theme still works. */
export interface PluginTheme {
  /** Unique within the plugin; namespaced with the plugin id when registered. */
  id: string
  name: string
  base: ThemeBase
  tokens: Partial<ThemeTokens>
}

/** An animated backdrop behind the app shell. */
export interface PluginBackground {
  /** `gradient` drifts a soft multi-stop gradient; `aurora` adds slow colour
   *  blobs over it; `image` shows a picture **shipped inside your package**.
   *  Anything else is ignored. */
  kind: 'gradient' | 'aurora' | 'image'
  /** `image` only: a path inside your own plugin folder, e.g. `bg/dusk.jpg`.
   *  There is no URL form on purpose — a remote image would make every paint an
   *  outbound request, and the WebView's CSP blocks it anyway. */
  file?: string
  /** `image` only: how it fills the window (default `cover`). */
  fit?: 'cover' | 'contain' | 'tile'
  /** `image` only: 0–1 blend toward the theme's background, for text contrast. */
  dim?: number
  /** `image` only: blur radius in px, 0–40. */
  blur?: number
  /** 2–4 CSS colours. Omit to follow the active theme (bg, surface-2, accent),
   *  which is usually what you want — it re-themes for free. */
  colors?: string[]
  /** Gradient angle in degrees (default 135). */
  angle?: number
  /** Seconds for one full drift cycle, 4–240 (default 40). */
  speed?: number
  /** 0–1, how strongly it shows over the base background (default 1). */
  opacity?: number
}

/** A registered theme, with the plugin that owns it. */
export interface StoredPluginTheme extends PluginTheme {
  pluginId: string
  /** `${pluginId}:${id}` — what the UI keys and compares on. */
  key: string
}

export interface StoredPluginBackground extends PluginBackground {
  pluginId: string
  /** `image` only: the resolved `data:` URI, filled in by the host after it has
   *  read the file out of the plugin's folder. Absent until then, so the layer
   *  renders nothing rather than flashing an empty box. */
  src?: string
}

/** Image types a plugin backdrop may use. SVG is excluded deliberately: it is a
 *  document format that can carry script and external references, and nothing
 *  here needs it. */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif']

/**
 * A path inside the plugin's own folder, and nothing else. Same rules as the
 * loader's `safe_relative` (Rust re-checks it — this is the early, legible
 * refusal, not the boundary).
 */
export function isSafePluginFile(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v || v.length > 256) return false
  if (v.includes('..') || v.startsWith('/') || v.startsWith('\\') || v.includes(':')) return false
  const ext = v.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.includes(ext)
}

// ── Value grammars ───────────────────────────────────────────────────────────
// Allowlists, not denylists. A denylist for CSS ("no url(", "no @import") is a
// game you lose: values also arrive through `rgb(var(--x))`, escapes, and
// whatever the engine adds next year. Matching the shapes we actually mean is
// the only version of this that stays true.

/** Six-digit hex, and only that, for stored theme colours — see `isThemeColor`. */
const HEX6 = /^#[0-9a-f]{6}$/i
const HEX_ANY = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const NUMERIC_FN = /^(rgb|rgba|hsl|hsla)\(\s*[-0-9.,%\s/]+\)$/i
const LENGTH = /^-?(?:\d+|\d*\.\d+)(px|rem|em|%)$/
const TIME = /^(?:\d+|\d*\.\d+)(ms|s)$/
const CUBIC = /^cubic-bezier\(\s*[-0-9.,\s]+\)$/
const KEYWORD_EASE = new Set(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end'])

/**
 * A colour we are willing to write into a custom property, for uses that only
 * ever paint it — the backdrop. Shorthand hex, alpha hex and `rgb()`/`hsl()` are
 * all fine here.
 */
export function isSafeColor(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const v = value.trim()
  return v.length <= 64 && (HEX_ANY.test(v) || NUMERIC_FN.test(v))
}

/**
 * A colour for a **stored theme token**, which is stricter: `#rrggbb` only.
 *
 * Not fussiness. `resolveVars` derives a dozen more tokens from these by channel
 * arithmetic — `--accent-hover/active/soft/softer` from `--accent`,
 * `--surface-rgb` from `--surface`, and `--on-accent` by WCAG contrast — and
 * `hexToRgb` parses six-digit hex and nothing else. Feed it `rgb(124,106,247)`
 * and every derived value silently degrades: hover states stop differing from
 * rest, translucent surfaces fall back to the dark default, and `--on-accent`
 * reads the accent as black and picks white text, which on a pale accent is
 * invisible. Better to drop the token and keep the preset's value.
 */
export function isThemeColor(value: unknown): value is string {
  return typeof value === 'string' && HEX6.test(value.trim())
}

function isLength(v: string): boolean {
  return LENGTH.test(v)
}

function isTime(v: string): boolean {
  return TIME.test(v)
}

function isEasing(v: string): boolean {
  return KEYWORD_EASE.has(v) || CUBIC.test(v)
}

function isScale(v: string): boolean {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 2
}

/** Which grammar each stored token must satisfy. Keys not listed are rejected,
 *  so a plugin can only reach tokens the Theme Studio itself edits. */
const TOKEN_RULES: Record<keyof ThemeTokens, (v: string) => boolean> = {
  '--bg': isThemeColor,
  '--surface': isThemeColor,
  '--surface-2': isThemeColor,
  '--surface-3': isThemeColor,
  '--border': isThemeColor,
  '--border-hover': isThemeColor,
  '--accent': isThemeColor,
  '--text-1': isThemeColor,
  '--text-2': isThemeColor,
  '--text-3': isThemeColor,
  '--danger': isThemeColor,
  '--success': isThemeColor,
  '--warning': isThemeColor,
  '--star': isThemeColor,
  '--radius-sm': isLength,
  '--radius-md': isLength,
  '--radius-lg': isLength,
  '--motion-scale': isScale,
  '--motion-duration-fast': isTime,
  '--motion-duration-base': isTime,
  '--motion-duration-slow': isTime,
  '--motion-ease': isEasing,
}

/** Keep only token entries that exist and parse. Never throws. */
export function sanitizeTokens(input: unknown): Partial<ThemeTokens> {
  if (!input || typeof input !== 'object') return {}
  const out: Partial<ThemeTokens> = {}
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const rule = TOKEN_RULES[key as keyof ThemeTokens]
    if (!rule) continue
    const value = typeof raw === 'number' ? String(raw) : raw
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (rule(trimmed)) out[key as keyof ThemeTokens] = trimmed
  }
  return out
}

/** Validate a plugin's theme declaration, or `null` if nothing usable survives. */
export function sanitizeTheme(pluginId: string, input: unknown): StoredPluginTheme | null {
  if (!input || typeof input !== 'object') return null
  const t = input as Partial<PluginTheme>
  const id = typeof t.id === 'string' ? t.id.trim().slice(0, 64) : ''
  const name = typeof t.name === 'string' ? t.name.trim().slice(0, 60) : ''
  if (!id || !name) return null
  const tokens = sanitizeTokens(t.tokens)
  // A theme that contributed no valid token would silently apply as "the default
  // theme, renamed" — confusing for the user and invisible to its author.
  if (Object.keys(tokens).length === 0) return null
  return {
    pluginId,
    key: `${pluginId}:${id}`,
    id,
    name,
    base: t.base === 'light' ? 'light' : 'dark',
    tokens,
  }
}

/** Validate a background declaration, or `null`. */
export function sanitizeBackground(pluginId: string, input: unknown): StoredPluginBackground | null {
  if (!input || typeof input !== 'object') return null
  const b = input as Partial<PluginBackground>
  if (b.kind !== 'gradient' && b.kind !== 'aurora' && b.kind !== 'image') return null
  const clamp = (n: unknown, lo: number, hi: number, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback

  if (b.kind === 'image') {
    if (!isSafePluginFile(b.file)) return null
    return {
      pluginId,
      kind: 'image',
      file: b.file.trim(),
      fit: b.fit === 'contain' || b.fit === 'tile' ? b.fit : 'cover',
      // A photo behind a text app is a contrast problem before it is a style
      // choice, so dim defaults to a real amount rather than none.
      dim: clamp(b.dim, 0, 1, 0.4),
      blur: clamp(b.blur, 0, 40, 0),
      opacity: clamp(b.opacity, 0, 1, 1),
    }
  }

  const colors = Array.isArray(b.colors) ? b.colors.filter(isSafeColor).slice(0, 4) : []
  return {
    pluginId,
    kind: b.kind,
    // Fewer than two colours can't make a gradient; fall back to the theme's own.
    ...(colors.length >= 2 ? { colors } : {}),
    angle: clamp(b.angle, 0, 360, 135),
    speed: clamp(b.speed, 4, 240, 40),
    opacity: clamp(b.opacity, 0, 1, 1),
  }
}

/** Merge a plugin theme onto a full base theme, so partial tokens are complete. */
export function applyPluginTheme(base: Theme, t: StoredPluginTheme): Theme {
  return {
    ...base,
    name: t.name,
    // Not a preset and not hand-edited — clearing this is what makes the Theme
    // Studio show it as a custom theme the user can then tweak and save.
    presetId: null,
    base: t.base,
    tokens: { ...base.tokens, ...t.tokens },
  }
}

// ── Registry ─────────────────────────────────────────────────────────────────

const themes = new Map<string, StoredPluginTheme>()
/** One background at a time: the last plugin to set one wins, and it is cleared
 *  when that plugin unloads. Stacking two animated backdrops helps nobody. */
let background: StoredPluginBackground | null = null

let version = 0
const listeners = new Set<() => void>()

// Notifications are coalesced to one per microtask. The *store* updates
// synchronously (a caller that registers then reads sees its own write), but
// subscribers — the rail, the backdrop, the Settings panes — are told once per
// batch. Without this, a plugin redeclaring a panel in a loop re-renders the app
// once per call, which is a stutter no rate limit can fully hide.
let pending = false

function changed(): void {
  version += 1
  if (pending) return
  pending = true
  queueMicrotask(() => {
    pending = false
    listeners.forEach((l) => l())
  })
}

export function subscribePluginThemes(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPluginThemesVersion(): number {
  return version
}

/** Register (or replace) a plugin theme. Returns its key, or null if refused. */
export function registerPluginTheme(pluginId: string, input: unknown): string | null {
  const theme = sanitizeTheme(pluginId, input)
  if (!theme) return null
  themes.set(theme.key, theme)
  changed()
  return theme.key
}

export function unregisterPluginTheme(key: string): void {
  if (themes.delete(key)) changed()
}

export function listPluginThemes(): StoredPluginTheme[] {
  return Array.from(themes.values())
}

/** Set the app background. `null` clears it. Returns true when it took effect. */
export function setPluginBackground(pluginId: string, input: unknown): boolean {
  if (input === null) {
    if (background?.pluginId === pluginId) {
      background = null
      changed()
    }
    return true
  }
  const next = sanitizeBackground(pluginId, input)
  if (!next) return false
  background = next
  changed()
  return true
}

export function getPluginBackground(): StoredPluginBackground | null {
  return background
}

/** Attach the resolved image data the host read out of the plugin's folder. The
 *  id and file are re-checked because the read is async — the background may have
 *  been replaced or cleared while it was in flight. */
export function setPluginBackgroundSrc(pluginId: string, file: string, src: string): void {
  if (!background || background.pluginId !== pluginId || background.file !== file) return
  background = { ...background, src }
  changed()
}

/** Drop everything a plugin contributed (called on unregister). */
export function clearPluginAppearance(pluginId: string): void {
  let dirty = false
  for (const [key, theme] of themes) {
    if (theme.pluginId === pluginId) {
      themes.delete(key)
      dirty = true
    }
  }
  if (background?.pluginId === pluginId) {
    background = null
    dirty = true
  }
  if (dirty) changed()
}
