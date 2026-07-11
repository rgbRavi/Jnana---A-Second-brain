// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Token schema, font catalog, and easing list for Theme Studio. Pure data — no
// React, no invoke() — ported from the design_handoff_theme_studio/ prototype
// (studio-data.jsx).

export type TokenKind = 'color' | 'px' | 'scale' | 'ms' | 'ease'

export interface TokenDef {
  /** CSS custom-property name, e.g. "--accent". */
  k: string
  label: string
  kind: TokenKind
  min?: number
  max?: number
  /** The surface/text token this one is typically read against, for contrast hints. */
  pairWith?: string
}

export interface TokenGroup {
  id: string
  label: string
  tokens: TokenDef[]
}

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    id: 'base',
    label: 'Base surfaces',
    tokens: [
      { k: '--bg', label: 'App background', kind: 'color' },
      { k: '--surface', label: 'Surface', kind: 'color' },
      { k: '--surface-2', label: 'Surface 2', kind: 'color' },
      { k: '--surface-3', label: 'Surface 3', kind: 'color' },
      { k: '--border', label: 'Border', kind: 'color' },
      { k: '--border-hover', label: 'Border hover', kind: 'color' },
    ],
  },
  {
    id: 'text',
    label: 'Text',
    tokens: [
      { k: '--text-1', label: 'Text primary', kind: 'color', pairWith: '--bg' },
      { k: '--text-2', label: 'Text secondary', kind: 'color', pairWith: '--surface' },
      { k: '--text-3', label: 'Text muted', kind: 'color', pairWith: '--surface' },
    ],
  },
  {
    id: 'accent',
    label: 'Accent & status',
    tokens: [
      { k: '--accent', label: 'Accent', kind: 'color' },
      { k: '--danger', label: 'Danger', kind: 'color' },
    ],
  },
  {
    id: 'radius',
    label: 'Corner radius',
    tokens: [
      { k: '--radius-sm', label: 'Small', kind: 'px', min: 0, max: 16 },
      { k: '--radius-md', label: 'Medium', kind: 'px', min: 0, max: 24 },
      { k: '--radius-lg', label: 'Large', kind: 'px', min: 0, max: 32 },
    ],
  },
  {
    id: 'motion',
    label: 'Motion',
    tokens: [
      { k: '--motion-scale', label: 'Master scale', kind: 'scale', min: 0, max: 2 },
      { k: '--motion-duration-fast', label: 'Fast', kind: 'ms', min: 0, max: 400 },
      { k: '--motion-duration-base', label: 'Base', kind: 'ms', min: 0, max: 700 },
      { k: '--motion-duration-slow', label: 'Slow', kind: 'ms', min: 0, max: 1200 },
      { k: '--motion-ease', label: 'Easing', kind: 'ease' },
    ],
  },
]

export const EASES: { id: string; label: string }[] = [
  { id: 'cubic-bezier(0.4, 0, 0.2, 1)', label: 'Standard' },
  { id: 'cubic-bezier(0.34, 1.56, 0.64, 1)', label: 'Spring' },
  { id: 'cubic-bezier(0.16, 1, 0.3, 1)', label: 'Expo out' },
  { id: 'cubic-bezier(0.65, 0, 0.35, 1)', label: 'In-out' },
  { id: 'linear', label: 'Linear' },
]

/** compact|cozy|comfortable -> spacing multiplier. Not yet consumed by any
 *  CSS — the Design tab writes `--density`, wiring it up is a later pass. */
export const DENSITY_SCALE: Record<string, number> = { compact: 0.82, cozy: 1, comfortable: 1.18 }

export const READING_SCALE_MIN = 0.85
export const READING_SCALE_MAX = 1.4
export const READING_SCALE_STEP = 0.05

export const ACCENT_SWATCHES = [
  '#7c6af7', '#6a52e0', '#2a8af6', '#1f9d6b', '#e0883c', '#e0526e', '#d94fd0', '#ffd200',
]

/** Font catalog, kept as data only — no font picker ships in this phase
 *  (fonts stay DM Sans/DM Mono), but the catalog is here for forward-compat
 *  with the theme JSON's `fonts` field and a future font-vendoring pass. */
export interface FontDef {
  id: string
  label: string
  stack: string
  note?: string
}

export const FONTS: Record<'body' | 'mono' | 'reading', FontDef[]> = {
  body: [
    { id: 'DM Sans', label: 'DM Sans', stack: "'DM Sans', sans-serif", note: 'default' },
    { id: 'Geist', label: 'Geist', stack: "'Geist', sans-serif" },
    { id: 'Public Sans', label: 'Public Sans', stack: "'Public Sans', sans-serif" },
    { id: 'Figtree', label: 'Figtree', stack: "'Figtree', sans-serif" },
    { id: 'Schibsted Grotesk', label: 'Schibsted', stack: "'Schibsted Grotesk', sans-serif" },
  ],
  mono: [
    { id: 'DM Mono', label: 'DM Mono', stack: "'DM Mono', monospace", note: 'default' },
    { id: 'JetBrains Mono', label: 'JetBrains', stack: "'JetBrains Mono', monospace" },
    { id: 'Space Mono', label: 'Space Mono', stack: "'Space Mono', monospace" },
    { id: 'IBM Plex Mono', label: 'IBM Plex', stack: "'IBM Plex Mono', monospace" },
  ],
  reading: [
    { id: 'Newsreader', label: 'Newsreader', stack: "'Newsreader', Georgia, serif", note: 'serif' },
    { id: 'Source Serif 4', label: 'Source Serif 4', stack: "'Source Serif 4', Georgia, serif", note: 'serif' },
    { id: 'Spectral', label: 'Spectral', stack: "'Spectral', Georgia, serif", note: 'serif' },
    { id: 'DM Sans', label: 'DM Sans', stack: "'DM Sans', sans-serif", note: 'sans' },
  ],
}
