// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A plugin theme is values that get written into CSS custom properties, so this
// is where "data, not CSS" is actually enforced. The cases that matter are the
// ones a hostile or sloppy plugin would send: a remote `url()` (an outbound
// request on every paint), something that tries to close the declaration, and
// token names the Theme Studio doesn't own.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyPluginTheme,
  clearPluginAppearance,
  getPluginBackground,
  listPluginThemes,
  registerPluginTheme,
  sanitizeBackground,
  sanitizeTheme,
  sanitizeTokens,
  setPluginBackground,
  setPluginBackgroundSrc,
} from './pluginThemes'
import { themeFromPreset } from '../core/themes/presets'

describe('plugin theme sanitization', () => {
  it('keeps values that parse as the thing the token means', () => {
    expect(
      sanitizeTokens({
        '--bg': '#101014',
        '--accent': '#7c6af7',
        '--text-1': '#FFFFFF',
        '--radius-md': '12px',
        '--motion-duration-base': '200ms',
        '--motion-ease': 'cubic-bezier(0.4, 0, 0.2, 1)',
        '--motion-scale': '0.5',
      }),
    ).toEqual({
      '--bg': '#101014',
      '--accent': '#7c6af7',
      '--text-1': '#FFFFFF',
      '--radius-md': '12px',
      '--motion-duration-base': '200ms',
      '--motion-ease': 'cubic-bezier(0.4, 0, 0.2, 1)',
      '--motion-scale': '0.5',
    })
  })

  it('drops anything that could reach the network or escape the declaration', () => {
    expect(
      sanitizeTokens({
        '--bg': 'url(https://tracker.example/pixel.png)',
        '--surface': 'red; background: url(https://tracker.example/x)',
        '--accent': 'var(--anything)',
        '--text-1': 'image-set("a.png" 1x)',
        '--border': 'expression(alert(1))',
      }),
    ).toEqual({})
  })

  it('insists on six-digit hex for stored colours, so derived tokens still work', () => {
    // `resolveVars` does channel arithmetic on these (accent hover/soft,
    // --surface-rgb, --on-accent) and `hexToRgb` only parses #rrggbb. Accepting
    // rgb() here would not fail loudly — it would quietly flatten hover states
    // and pick an unreadable label colour.
    expect(sanitizeTokens({ '--accent': 'rgb(124, 106, 247)' })).toEqual({})
    expect(sanitizeTokens({ '--accent': '#abc' })).toEqual({})
    expect(sanitizeTokens({ '--accent': '#7c6af780' })).toEqual({})
    expect(sanitizeTokens({ '--accent': '#7c6af7' })).toEqual({ '--accent': '#7c6af7' })
  })

  it('drops tokens the Theme Studio does not own', () => {
    expect(sanitizeTokens({ '--content': '"x"', 'cursor': 'none', '--surface-1': '#fff' })).toEqual({})
  })

  it('refuses a theme with no usable token at all', () => {
    expect(sanitizeTheme('p', { id: 't', name: 'T', base: 'dark', tokens: { '--bg': 'url(x)' } })).toBeNull()
    expect(sanitizeTheme('p', { id: '', name: 'T', tokens: { '--bg': '#000' } })).toBeNull()
    expect(sanitizeTheme('p', null)).toBeNull()
  })

  it('namespaces a theme by its plugin', () => {
    const t = sanitizeTheme('com.test.p', { id: 'nord', name: 'Nord', base: 'dark', tokens: { '--bg': '#2e3440' } })
    expect(t).toMatchObject({ key: 'com.test.p:nord', pluginId: 'com.test.p', base: 'dark' })
  })

  it('merges onto a full base theme, so partial tokens still apply', () => {
    const t = sanitizeTheme('p', { id: 'x', name: 'X', base: 'dark', tokens: { '--accent': '#88c0d0' } })!
    const applied = applyPluginTheme(themeFromPreset('dark'), t)

    expect(applied.tokens['--accent']).toBe('#88c0d0')
    expect(applied.tokens['--bg']).toBe(themeFromPreset('dark').tokens['--bg'])
    // Cleared, so the Theme Studio treats it as a custom theme to tweak and save.
    expect(applied.presetId).toBeNull()
    expect(applied.name).toBe('X')
  })
})

describe('plugin background', () => {
  it('clamps its numbers and drops unsafe colours', () => {
    const bg = sanitizeBackground('p', {
      kind: 'gradient',
      colors: ['#123456', 'url(https://x/y.png)', 'rgb(1,2,3)'],
      angle: 999,
      speed: 0.1,
      opacity: 5,
    })
    expect(bg).toMatchObject({ colors: ['#123456', 'rgb(1,2,3)'], angle: 360, speed: 4, opacity: 1 })
  })

  it('falls back to theme colours when fewer than two survive', () => {
    const bg = sanitizeBackground('p', { kind: 'aurora', colors: ['url(evil)'] })
    expect(bg?.colors).toBeUndefined()
  })

  it('refuses an unknown kind', () => {
    expect(sanitizeBackground('p', { kind: 'video', src: 'https://x/y.mp4' })).toBeNull()
  })

  it('takes an image the plugin ships, by relative path only', () => {
    expect(sanitizeBackground('p', { kind: 'image', file: 'bg/dusk.jpg' })).toMatchObject({
      kind: 'image',
      file: 'bg/dusk.jpg',
      fit: 'cover',
      // A photo behind a text app is a contrast problem first, so dim is not 0.
      dim: 0.4,
    })
  })

  it('refuses an image path that leaves the plugin, or a type it should not have', () => {
    // No URL form at all: a remote image is a request on every paint, and the CSP
    // blocks it regardless.
    expect(sanitizeBackground('p', { kind: 'image', file: 'https://x/y.png' })).toBeNull()
    expect(sanitizeBackground('p', { kind: 'image', file: '../../../etc/passwd' })).toBeNull()
    expect(sanitizeBackground('p', { kind: 'image', file: '/etc/hosts.png' })).toBeNull()
    expect(sanitizeBackground('p', { kind: 'image', file: 'C:/win.png' })).toBeNull()
    // SVG can carry script and external references; a backdrop needs none of it.
    expect(sanitizeBackground('p', { kind: 'image', file: 'bg/art.svg' })).toBeNull()
    expect(sanitizeBackground('p', { kind: 'image' })).toBeNull()
  })

  it('attaches resolved image data only to the background still in force', () => {
    setPluginBackground('com.test.a', { kind: 'image', file: 'bg/a.png' })
    // A late answer for a background that has since been replaced must be dropped,
    // or a switched-away image would flash back in.
    setPluginBackgroundSrc('com.test.a', 'bg/old.png', 'data:image/png;base64,AAA')
    expect(getPluginBackground()?.src).toBeUndefined()

    setPluginBackgroundSrc('com.test.a', 'bg/a.png', 'data:image/png;base64,AAA')
    expect(getPluginBackground()?.src).toBe('data:image/png;base64,AAA')
    clearPluginAppearance('com.test.a')
  })
})

describe('plugin appearance registry', () => {
  beforeEach(() => {
    clearPluginAppearance('com.test.a')
    clearPluginAppearance('com.test.b')
  })

  it('takes a plugin’s themes and background away with it', () => {
    registerPluginTheme('com.test.a', { id: 'one', name: 'One', base: 'dark', tokens: { '--bg': '#000000' } })
    setPluginBackground('com.test.a', { kind: 'gradient' })

    expect(listPluginThemes().some((t) => t.pluginId === 'com.test.a')).toBe(true)
    expect(getPluginBackground()?.pluginId).toBe('com.test.a')

    clearPluginAppearance('com.test.a')

    expect(listPluginThemes().some((t) => t.pluginId === 'com.test.a')).toBe(false)
    expect(getPluginBackground()).toBeNull()
  })

  it('leaves another plugin’s background alone when one unloads', () => {
    setPluginBackground('com.test.a', { kind: 'gradient' })
    setPluginBackground('com.test.b', { kind: 'aurora' })

    // b won the backdrop; a unloading must not clear it.
    clearPluginAppearance('com.test.a')
    expect(getPluginBackground()?.pluginId).toBe('com.test.b')
  })
})
