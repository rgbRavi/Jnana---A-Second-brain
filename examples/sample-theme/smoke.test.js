// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A theme plugin is mostly data, so what's worth testing is that the data is the
// shape the host accepts — including the six-digit-hex rule, which is the one
// that fails *silently* (derived hover/label colours degrade rather than error).

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from './src/index.js'
import { sanitizeTokens, sanitizeBackground } from '../../src/lib/pluginThemes'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'))

function stubContext() {
  const themes = []
  const backgrounds = []
  const settings = []
  const commands = []
  const ctx = {
    pluginId: plugin.id,
    bus: { on: vi.fn(), emit: vi.fn() },
    storage: { get: async () => null, set: async () => {}, delete: async () => {}, list: async () => ({}) },
    ui: {
      registerTheme: (t) => themes.push(t),
      setBackground: (b) => backgrounds.push(b),
      registerSettings: (d) => settings.push(d),
      registerCommand: (c) => commands.push(c),
    },
  }
  return { ctx, themes, backgrounds, settings, commands }
}

describe('sample theme plugin', () => {
  it('declares itself a sandboxed theme that asks for nothing', () => {
    expect(manifest.type).toBe('theme')
    expect(manifest.runtime).toBe('worker')
    // The whole point of the type: a theme with permissions would be a smell, and
    // the install prompt says so.
    expect(manifest.permissions).toEqual([])
    expect(manifest.id).toBe(plugin.id)
  })

  it('offers two themes whose tokens all survive validation', () => {
    const { ctx, themes } = stubContext()
    plugin.init(ctx)

    expect(themes.map((t) => t.id)).toEqual(['dusk', 'parchment'])
    for (const theme of themes) {
      const kept = sanitizeTokens(theme.tokens)
      // Not "most of them" — a dropped token silently falls back to the preset's
      // value, which is exactly the bug this catches.
      expect(Object.keys(kept)).toEqual(Object.keys(theme.tokens))
    }
  })

  it('leaves the backdrop off until asked, then follows the theme', () => {
    const { ctx, settings, backgrounds } = stubContext()
    plugin.init(ctx)
    expect(backgrounds).toHaveLength(0)

    settings[0].onChange({ backdrop: 'gradient' })
    const bg = backgrounds[backgrounds.length - 1]
    expect(sanitizeBackground('p', bg)).toMatchObject({ kind: 'gradient' })
    // No colours declared, so the host paints it from the active theme's tokens.
    expect(bg.colors).toBeUndefined()

    settings[0].onChange({ backdrop: 'off' })
    expect(backgrounds[backgrounds.length - 1]).toBeNull()
  })

  it('ships its backdrop image inside the package, by relative path', async () => {
    const { ctx, settings, backgrounds } = stubContext()
    plugin.init(ctx)

    settings[0].onChange({ backdrop: 'image' })
    const bg = backgrounds[backgrounds.length - 1]
    expect(sanitizeBackground('p', bg)).toMatchObject({ kind: 'image', file: 'bg/dusk.png' })

    // The file it names has to actually be in the package, or the backdrop is a
    // dead reference that only shows up at runtime.
    const { existsSync } = await import('node:fs')
    expect(existsSync(join(here, bg.file))).toBe(true)
  })

  it('toggles the backdrop from its command', () => {
    const { ctx, commands, backgrounds } = stubContext()
    plugin.init(ctx)

    commands[0].run()
    expect(backgrounds[backgrounds.length - 1]).toMatchObject({ kind: 'gradient' })
    commands[0].run()
    expect(backgrounds[backgrounds.length - 1]).toBeNull()
  })
})
