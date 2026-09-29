// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Smoke test for the sandboxed sample: loads the very file the loader would run in
// the worker and drives its `init(ctx)` with a stub host. jsdom has no Worker, so
// the transport itself is covered by src/lib/pluginWorker.test.ts — this checks the
// other half, that the plugin only ever reaches the app through `ctx`.

import { describe, it, expect, vi } from 'vitest'
import plugin from './src/index.js'

function stubContext(granted = ['notes']) {
  const store = new Map()
  const commands = []
  const settings = []
  const panels = []
  const fences = []
  const listeners = new Map()
  const ctx = {
    pluginId: plugin.id,
    bus: {
      on: (event, handler) => listeners.set(event, handler),
      emit: vi.fn(),
    },
    storage: {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => void store.set(key, value),
      delete: async (key) => void store.delete(key),
      list: async () => Object.fromEntries(store),
    },
    notes: granted.includes('notes')
      ? {
          getAll: async () => [
            { id: 'a', title: 'Alpha' },
            { id: 'b', title: 'Beta' },
            { id: 'c', title: 'Alphabet' },
          ],
        }
      : undefined,
    registerNoteType: () => {
      throw new Error('registerNoteType is main-thread only')
    },
    ui: {
      registerWidget: () => {
        throw new Error('registerWidget is main-thread only')
      },
      registerCommand: (command) => commands.push(command),
      registerSettings: (definition) => settings.push(definition),
      registerRailPanel: () => {
        throw new Error('registerRailPanel is main-thread only')
      },
      registerBlockPanel: (panel) => panels.push(panel),
      registerFence: (fence) => fences.push(fence),
    },
  }
  return { ctx, store, commands, listeners, settings, panels, fences }
}

describe('sample worker plugin', () => {
  it('matches its manifest and contributes a command', () => {
    const { ctx, commands } = stubContext()
    plugin.init(ctx)

    expect(plugin.id).toBe('com.jnana.sample-worker')
    expect(commands.map((c) => c.id)).toEqual(['sample-worker.count'])
  })

  it('reads notes through the host and remembers across runs', async () => {
    const { ctx, store, commands } = stubContext()
    plugin.init(ctx)

    await commands[0].run()
    await commands[0].run()

    expect(store.get('lastCount')).toBe(3)
    expect(store.get('runs')).toBe(2)
    expect(ctx.bus.emit).toHaveBeenLastCalledWith('toast:info', '3 notes (counted 2x)')
  })

  it('declares settings the host can render, and honours changes', async () => {
    const { ctx, commands, settings } = stubContext()
    plugin.init(ctx)

    // A worker plugin can still be configured: it declares fields, the app draws them.
    expect(settings[0].fields.map((f) => f.key)).toEqual(['label', 'loud'])

    settings[0].onChange({ label: 'thoughts', loud: true })
    await commands[0].run()
    expect(ctx.bus.emit).toHaveBeenLastCalledWith('toast:info', '3 thoughts (counted 1x)')

    // Turning the toast off is honoured without a reload.
    ctx.bus.emit.mockClear()
    settings[0].onChange({ label: 'thoughts', loud: false })
    await commands[0].run()
    expect(ctx.bus.emit).not.toHaveBeenCalled()
  })

  it('describes a rail panel as data and updates it by re-registering', async () => {
    const { ctx, commands, panels } = stubContext()
    plugin.init(ctx)

    // Declared at init, so the panel is there before anything is pressed.
    expect(panels[0].id).toBe('sample-worker.panel')
    expect(panels[0].blocks.some((b) => b.type === 'button')).toBe(true)

    await commands[0].run()
    const latest = panels[panels.length - 1]
    expect(latest.blocks.find((b) => b.type === 'table').rows).toEqual([['notes', '3']])
  })

  it('renders its fenced language into blocks', async () => {
    const { ctx, fences } = stubContext()
    plugin.init(ctx)

    expect(fences[0].lang).toBe('notecount')
    const blocks = await fences[0].render('alpha')
    expect(blocks[0]).toMatchObject({ type: 'heading' })
    expect(blocks[1].rows).toEqual([['Alpha'], ['Alphabet']])
    expect(blocks[2]).toMatchObject({ type: 'text', text: '2 of 3' })
  })

  it('suggests a shortcut the user can override', () => {
    const { ctx, commands } = stubContext()
    plugin.init(ctx)
    expect(commands[0].hotkey).toBe('mod+alt+c')
  })

  it('degrades instead of crashing when notes were not granted', async () => {
    const { ctx, store, commands } = stubContext([])
    plugin.init(ctx)

    await commands[0].run()

    expect(store.get('lastCount')).toBe(0)
  })
})
