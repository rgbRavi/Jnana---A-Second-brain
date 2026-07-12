// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Text-colour support for the note composers. Colour is a first-party markdown
// token — `[c:NAME]text[/c]` — not raw HTML (the read-mode renderer has no
// rehype-raw, on purpose), so it flows through the same custom-token machinery
// as wikilinks/timestamps: remarkJnana turns it into a `jnana-color` node for
// read-mode, and the live editor's decoration walk styles it in edit-mode.
//
// `NAME` is a palette name (below), a bare CSS colour word, or a `#hex` value.
// `resolveColor` is the single sanitiser both renderers use, so an arbitrary /
// malicious value can never reach an inline `style` (CSS-injection guard).

export interface PaletteColor {
  /** Token name written into the markdown, e.g. `[c:red]`. */
  name: string
  /** Human label for the picker. */
  label: string
  /** The CSS colour actually rendered — a mid-tone that stays legible on both
   *  the light and dark surfaces. */
  hex: string
}

/** The curated swatch set shown in the toolbar / context-menu colour picker. */
export const COLOR_PALETTE: readonly PaletteColor[] = [
  { name: 'red', label: 'Red', hex: '#e5484d' },
  { name: 'orange', label: 'Orange', hex: '#f76808' },
  { name: 'green', label: 'Green', hex: '#30a46c' },
  { name: 'teal', label: 'Teal', hex: '#12a594' },
  { name: 'blue', label: 'Blue', hex: '#0091ff' },
  { name: 'purple', label: 'Purple', hex: '#8e4ec6' },
  { name: 'pink', label: 'Pink', hex: '#e93d82' },
  { name: 'gray', label: 'Gray', hex: '#8b8d98' },
]

const PALETTE_BY_NAME = new Map(COLOR_PALETTE.map((c) => [c.name, c.hex]))

/**
 * Resolve a colour token value to a safe CSS colour string, or `null` when it's
 * not a value we're willing to put in an inline `style`. Accepts, in order: a
 * palette name (→ its curated hex), a `#hex` (3/6/8 digits), or a bare CSS
 * colour word (letters only — covers `red`, `rebeccapurple`, …). Anything with
 * punctuation/whitespace (a CSS-injection attempt) returns `null`.
 */
export function resolveColor(value: string): string | null {
  const v = value.trim()
  const named = PALETTE_BY_NAME.get(v.toLowerCase())
  if (named) return named
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return v
  if (/^[a-zA-Z]{1,20}$/.test(v)) return v.toLowerCase()
  return null
}

// `[c:NAME]text[/c]` (text colour) and `[h:NAME]text[/h]` (highlight/background)
// — NAME is the constrained charset above; inner text is any run up to the first
// closer. Kept as source strings + factories (fresh regex per call) for the same
// reason as tokenPatterns.ts: a shared `g`-flagged instance carries mutable
// `lastIndex` and would cross-contaminate scans.
export const COLOR_TOKEN_SOURCE = '\\[c:([#0-9a-zA-Z]{1,20})\\]([\\s\\S]*?)\\[\\/c\\]'
export const HIGHLIGHT_TOKEN_SOURCE = '\\[h:([#0-9a-zA-Z]{1,20})\\]([\\s\\S]*?)\\[\\/h\\]'
// Matches EITHER token, capturing the kind (`c`/`h`) so a single left-to-right
// scan finds the *outermost* span even when the two are nested (a highlight
// inside a text colour, or vice-versa): the `\1` backreference ties the closer
// to its own opener, so a non-greedy inner still stops at the matching `[/c]`/
// `[/h]` rather than an inner one. Groups: 1 = kind, 2 = colour, 3 = inner.
export const COLOR_ANY_TOKEN_SOURCE = '\\[([ch]):([#0-9a-zA-Z]{1,20})\\]([\\s\\S]*?)\\[\\/\\1\\]'

/** Fresh global-flagged regex, for scanning a whole string (remark / decorations). */
export const colorTokenRegex = (): RegExp => new RegExp(COLOR_TOKEN_SOURCE, 'g')
export const highlightTokenRegex = (): RegExp => new RegExp(HIGHLIGHT_TOKEN_SOURCE, 'g')
export const colorAnyTokenRegex = (): RegExp => new RegExp(COLOR_ANY_TOKEN_SOURCE, 'g')

/**
 * CSS background for a highlight (`[h:…]`) span — a translucent wash of the
 * (already-sanitised) resolved colour, so the text underneath stays legible
 * like a real highlighter. `resolved` must come from `resolveColor`.
 */
export function highlightBackground(resolved: string): string {
  return `color-mix(in srgb, ${resolved} 40%, transparent)`
}
