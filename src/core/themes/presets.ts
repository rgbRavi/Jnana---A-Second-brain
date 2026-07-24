// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Built-in theme presets — ported from design_handoff_theme_studio/studio-presets.jsx.

import type { Theme, ThemeBase, ThemeTokens } from '../../types'

/** Tokens shared by every preset (status + radius + motion); presets override
 *  the surface/text/accent palette, and light-based presets re-tune status. */
const BASE_TOKENS = {
  '--success': '#3fb950',
  '--warning': '#e3b341',
  '--star': '#ffcc00',
  '--radius-sm': '6px',
  '--radius-md': '10px',
  '--radius-lg': '14px',
  '--motion-scale': '1',
  '--motion-duration-fast': '120ms',
  '--motion-duration-base': '220ms',
  '--motion-duration-slow': '420ms',
  '--motion-ease': 'cubic-bezier(0.4, 0, 0.2, 1)',
}

export interface ThemePreset {
  id: string
  name: string
  base: ThemeBase
  /** [dark swatch, accent swatch, light swatch] for the preset gallery strip. */
  swatch: [string, string, string]
  blurb: string
  tokens: Partial<ThemeTokens>
}

export const PRESETS: ThemePreset[] = [
  {
    id: 'dark',
    name: 'Midnight',
    base: 'dark',
    swatch: ['#0d0d0f', '#7c6af7', '#f0eff5'],
    blurb: 'The Jnana default — deep neutral dark, violet accent.',
    tokens: {
      '--bg': '#0d0d0f', '--surface': '#141417', '--surface-2': '#1c1c21',
      '--surface-3': '#26262e', '--border': '#2a2a32', '--border-hover': '#3d3d4a',
      '--accent': '#7c6af7', '--text-1': '#f0eff5', '--text-2': '#9896a4',
      '--text-3': '#55535f', '--danger': '#e05252',
    },
  },
  {
    id: 'light',
    name: 'Paper',
    base: 'light',
    swatch: ['#f7f7f9', '#6a52e0', '#1a1a20'],
    blurb: 'Clean warm-neutral light with the same violet identity.',
    tokens: {
      '--bg': '#f6f6f8', '--surface': '#ffffff', '--surface-2': '#f0f0f4',
      '--surface-3': '#e6e6ec', '--border': '#e2e2e9', '--border-hover': '#cfcfd9',
      '--accent': '#6a52e0', '--text-1': '#1a1a20', '--text-2': '#5b5a67',
      '--text-3': '#9a98a6', '--danger': '#cc3b3b',
      '--success': '#1a7f37', '--warning': '#9a6700', '--star': '#b8860b',
    },
  },
  {
    id: 'oled',
    name: 'OLED',
    base: 'dark',
    swatch: ['#000000', '#8b7bff', '#ffffff'],
    blurb: 'True black for OLED panels — maximum contrast, minimum glow.',
    tokens: {
      '--bg': '#000000', '--surface': '#0a0a0c', '--surface-2': '#121214',
      '--surface-3': '#1c1c20', '--border': '#222226', '--border-hover': '#34343c',
      '--accent': '#8b7bff', '--text-1': '#ffffff', '--text-2': '#a4a2b0',
      '--text-3': '#5a5862', '--danger': '#ff5c5c',
    },
  },
  {
    id: 'contrast',
    name: 'High Contrast',
    base: 'dark',
    swatch: ['#000000', '#ffd200', '#ffffff'],
    blurb: 'WCAG-AAA leaning — bold borders, yellow accent, no mid-greys.',
    tokens: {
      '--bg': '#000000', '--surface': '#0c0c0c', '--surface-2': '#161616',
      '--surface-3': '#222222', '--border': '#4a4a4a', '--border-hover': '#6e6e6e',
      '--accent': '#ffd200', '--text-1': '#ffffff', '--text-2': '#e0e0e0',
      '--text-3': '#b4b4b4', '--danger': '#ff6b6b',
      '--radius-sm': '4px', '--radius-md': '6px', '--radius-lg': '8px',
    },
  },
  {
    id: 'sepia',
    name: 'Reading',
    base: 'light',
    swatch: ['#f3ead8', '#9a6a3c', '#3a2f24'],
    blurb: 'Warm sepia paper tuned for long-form reading sessions.',
    tokens: {
      '--bg': '#efe5d2', '--surface': '#f7efde', '--surface-2': '#eee2cc',
      '--surface-3': '#e3d4b9', '--border': '#ddcdac', '--border-hover': '#c9b48c',
      '--accent': '#9a6a3c', '--text-1': '#3a2f24', '--text-2': '#6b5b46',
      '--text-3': '#9a8a6e', '--danger': '#b0452f',
      '--success': '#4a7a3f', '--warning': '#9a6a1f', '--star': '#b8860b',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    base: 'dark',
    swatch: ['#2e3440', '#88c0d0', '#eceff4'],
    blurb: 'Icy Arctic palette — cool blue-greys with a frost-cyan accent.',
    tokens: {
      '--bg': '#2e3440', '--surface': '#343b48', '--surface-2': '#3b4252',
      '--surface-3': '#434c5e', '--border': '#434c5e', '--border-hover': '#4c566a',
      '--accent': '#88c0d0', '--text-1': '#eceff4', '--text-2': '#d8dee9',
      '--text-3': '#8892a3', '--danger': '#bf616a',
      '--success': '#a3be8c', '--warning': '#ebcb8b', '--star': '#ebcb8b',
    },
  },
  {
    id: 'everforest',
    name: 'Everforest',
    base: 'dark',
    swatch: ['#2d353b', '#a7c080', '#d3c6aa'],
    blurb: 'Low-contrast forest greens — soft and easy on the eyes.',
    tokens: {
      '--bg': '#2d353b', '--surface': '#343f44', '--surface-2': '#3d484d',
      '--surface-3': '#475258', '--border': '#475258', '--border-hover': '#4f585e',
      '--accent': '#a7c080', '--text-1': '#d3c6aa', '--text-2': '#a6b0a0',
      '--text-3': '#859289', '--danger': '#e67e80',
      '--success': '#a7c080', '--warning': '#dbbc7f', '--star': '#dbbc7f',
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    base: 'dark',
    swatch: ['#282828', '#fe8019', '#ebdbb2'],
    blurb: 'Retro warm earth tones with a bright orange accent.',
    tokens: {
      '--bg': '#282828', '--surface': '#32302f', '--surface-2': '#3c3836',
      '--surface-3': '#504945', '--border': '#504945', '--border-hover': '#665c54',
      '--accent': '#fe8019', '--text-1': '#ebdbb2', '--text-2': '#d5c4a1',
      '--text-3': '#a89984', '--danger': '#fb4934',
      '--success': '#b8bb26', '--warning': '#fabd2f', '--star': '#fabd2f',
    },
  },
  {
    id: 'solarized',
    name: 'Solarized',
    base: 'dark',
    swatch: ['#002b36', '#268bd2', '#eee8d5'],
    blurb: 'The classic Solarized Dark — precise teal base, blue accent.',
    tokens: {
      '--bg': '#002b36', '--surface': '#073642', '--surface-2': '#0e4653',
      '--surface-3': '#155661', '--border': '#16505d', '--border-hover': '#205e6e',
      '--accent': '#268bd2', '--text-1': '#eee8d5', '--text-2': '#93a1a1',
      '--text-3': '#728a90', '--danger': '#dc322f',
      '--success': '#859900', '--warning': '#b58900', '--star': '#b58900',
    },
  },
  {
    id: 'rose-dawn',
    name: 'Rosé Dawn',
    base: 'light',
    swatch: ['#faf4ed', '#b4637a', '#575279'],
    blurb: 'Soft rosé-tinted light theme — gentle warmth, muted ink.',
    tokens: {
      '--bg': '#faf4ed', '--surface': '#fffaf3', '--surface-2': '#f2e9e1',
      '--surface-3': '#eaddd1', '--border': '#e4dcd2', '--border-hover': '#d8cec2',
      '--accent': '#b4637a', '--text-1': '#575279', '--text-2': '#6c6784',
      '--text-3': '#837e97', '--danger': '#c1494b',
      '--success': '#4c7a34', '--warning': '#c1902f', '--star': '#c1902f',
    },
  },
]

const PRESET_META = {
  fonts: { body: 'DM Sans', mono: 'DM Mono', reading: 'Newsreader' },
  density: 'cozy' as const,
  readingScale: 1,
}

export function findPreset(id: string): ThemePreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]
}

/** Build a complete Theme from a preset id, merging in the shared base tokens. */
export function themeFromPreset(id: string): Theme {
  const p = findPreset(id)
  return {
    name: p.name,
    presetId: p.id,
    base: p.base,
    tokens: { ...BASE_TOKENS, ...p.tokens } as ThemeTokens,
    // Sepia's serif feel now comes from the Reading font applied to note content
    // (--font-reading), so the interface stays on the shared sans default.
    fonts: { ...PRESET_META.fonts },
    density: PRESET_META.density,
    readingScale: PRESET_META.readingScale,
  }
}

/**
 * Swap base mode while keeping accent/radius/motion — takes surface+text
 * tokens from the matching base's preset, keeps everything else from `theme`.
 */
export function swapBase(theme: Theme, base: ThemeBase): Theme {
  const src = PRESETS.find((p) => p.base === base) ?? PRESETS[0]
  const keep = [
    '--accent', '--danger', '--radius-sm', '--radius-md', '--radius-lg',
    '--motion-scale', '--motion-duration-fast', '--motion-duration-base',
    '--motion-duration-slow', '--motion-ease',
  ] as const
  const tokens = { ...BASE_TOKENS, ...src.tokens } as ThemeTokens
  for (const k of keep) tokens[k] = theme.tokens[k]
  return { ...theme, base, tokens, presetId: null }
}
