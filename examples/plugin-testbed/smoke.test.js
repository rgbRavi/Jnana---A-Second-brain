// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The testbed is a manual harness, but its wiring can still rot silently — it
// would keep loading and simply stop registering something. This drives
// `init(ctx)` against a stub host and checks that every surface is claimed, and
// that the checks report a failure honestly when a capability is missing.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import plugin from './src/index.js'

function stubContext({ granted = ['notes', 'media'], notes } = {}) {
  const store = new Map()
  const commands = []
  const panels = []
  const blockPanels = []
  const fences = []
  const settings = []
  const themes = []
  const backgrounds = []
  const all = notes ?? [
    { id: 'n1', title: 'Lecture', content: 'text ![](jnana-asset://slide.png)' },
    { id: 'n2', title: 'Plain', content: 'no media here' },
  ]

  const ctx = {
    pluginId: plugin.id,
    bus: { on: vi.fn(), emit: vi.fn() },
    storage: {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => void store.set(key, value),
      delete: async (key) => void store.delete(key),
      list: async () => Object.fromEntries(store),
    },
    notes: granted.includes('notes')
      ? {
          getAll: async () => all,
          create: async (title, content) => ({ id: 'created', title, content }),
        }
      : undefined,
    media: granted.includes('media')
      ? {
          list: async () => [{ kind: 'image', label: 'slide.png', source: 'asset', target: 'slide.png' }],
          read: async () => new Uint8Array([1, 2, 3, 4]),
          write: async () => 'written.png',
        }
      : undefined,
    registerNoteType: vi.fn(),
    ui: {
      registerWidget: vi.fn(),
      registerCommand: (c) => commands.push(c),
      registerSettings: (d) => settings.push(d),
      registerRailPanel: (p) => panels.push(p),
      registerBlockPanel: (p) => blockPanels.push(p),
      registerFence: (f) => fences.push(f),
      registerTheme: (t) => themes.push(t),
      setBackground: (b) => backgrounds.push(b),
    },
  }
  return { ctx, commands, panels, blockPanels, fences, settings, themes, backgrounds }
}

/** The results table from the most recently republished block panel. */
async function tableOf(blockPanels) {
  let table
  await vi.waitFor(() => {
    table = blockPanels[blockPanels.length - 1].blocks.find((b) => b.type === 'table')
    expect(table).toBeDefined()
  })
  return table
}

describe('plugin testbed', () => {
  beforeEach(() => {
    plugin.destroy()
  })

  it('claims every surface it is meant to exercise', () => {
    const { ctx, commands, panels, blockPanels, fences, settings } = stubContext()
    plugin.init(ctx)

    expect(panels.map((p) => p.id)).toEqual(['testbed.panel'])
    expect(blockPanels[0].id).toBe('testbed.blocks')
    expect(fences.map((f) => f.lang)).toEqual(['testbed'])
    expect(commands.map((c) => c.hotkey)).toEqual(['mod+alt+t', 'mod+w'])
    expect(settings[0].fields[0].key).toBe('toastOnRun')
  })

  it('reports passes when the capabilities are there', async () => {
    const { ctx, commands, blockPanels } = stubContext()
    plugin.init(ctx)

    // `run()` is fire-and-forget by contract (`run: () => void`), so wait for the
    // panel it republishes rather than for the call.
    commands[0].run()
    const table = await tableOf(blockPanels)
    const names = table.rows.map((r) => r[0])
    expect(names).toContain('ctx.media.list')
    expect(names).toContain('ctx.media.read')
    expect(table.rows.every((r) => r[1].startsWith('pass'))).toBe(true)
    expect(ctx.bus.emit).toHaveBeenCalledWith('toast:success', 'All checks passed')
  })

  it('fails loudly when the media permission is missing', async () => {
    const { ctx, commands, blockPanels } = stubContext({ granted: ['notes'] })
    plugin.init(ctx)

    commands[0].run()

    const table = await tableOf(blockPanels)
    expect(table.rows.find((r) => r[0] === 'ctx.media')[1]).toMatch(/^FAIL/)
  })

  it('says so when no note has an attachment, rather than passing on nothing', async () => {
    const { ctx, commands, blockPanels } = stubContext({
      notes: [{ id: 'n1', title: 'Plain', content: 'nothing embedded' }],
    })
    plugin.init(ctx)

    commands[0].run()

    const table = await tableOf(blockPanels)
    expect(table.rows.find((r) => r[0] === 'ctx.media.list')[1]).toMatch(/no note in this vault/)
  })

  it('contributes themes, including one token the host must refuse', () => {
    const { ctx, themes } = stubContext()
    plugin.init(ctx)

    expect(themes.map((t) => t.id)).toEqual(['testbed-deep', 'testbed-paper'])
    // The plugin declares it; lib/pluginThemes.ts is what drops it. Keeping the
    // bad token here is the point — it is the fixture for that check.
    expect(themes[0].tokens['--danger']).toMatch(/^url\(/)
  })

  it('sets and clears the backdrop from its settings pane', () => {
    const { ctx, settings, backgrounds } = stubContext()
    plugin.init(ctx)

    settings[0].onChange({ background: 'aurora' })
    expect(backgrounds[backgrounds.length - 1]).toMatchObject({ kind: 'aurora' })

    settings[0].onChange({ background: 'off' })
    expect(backgrounds[backgrounds.length - 1]).toBeNull()
  })

  it('renders its fence, and throws on the deliberate failure case', async () => {
    const { ctx, fences } = stubContext()
    plugin.init(ctx)

    const blocks = await fences[0].render('one\ntwo')
    expect(blocks[0]).toMatchObject({ type: 'heading' })
    expect(blocks.find((b) => b.type === 'list').items).toEqual(['one', 'two'])

    // The host catches this and shows the plain code block — that is the point.
    await expect(fences[0].render('fail')).rejects.toThrow(/deliberate failure/)
    expect(await fences[0].render('empty')).toEqual([])
  })
})
