// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from './src/index.js'
import { sanitizeAction } from '../../src/lib/pluginActions'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'))

function harness(notes) {
  const actions = []
  const bus = { on: vi.fn(), emit: vi.fn() }
  const ctx = {
    pluginId: plugin.id,
    bus,
    notes: {
      getById: async (id) => notes.find((n) => n.id === id),
      getAll: async () => notes,
    },
    ui: { registerAction: (a) => actions.push(a) },
  }
  plugin.init(ctx)
  return { actions, bus }
}

describe('sample actions plugin', () => {
  it('runs sandboxed, asks only for notes, matches its manifest', () => {
    expect(manifest.runtime).toBe('worker')
    expect(manifest.permissions).toEqual(['notes'])
    expect(plugin.id).toBe(manifest.id)
  })

  it('declares one valid action per slot', () => {
    const { actions } = harness([])
    expect(actions.map((a) => a.slot).sort()).toEqual(['editor.toolbar', 'note.menu', 'sidebar'])
    for (const a of actions) expect(sanitizeAction(a)).not.toBeNull()
  })

  it('word count toasts the count for the clicked note', async () => {
    const { actions, bus } = harness([{ id: 'n1', title: 'T', content: 'one two  three' }])
    await actions.find((a) => a.slot === 'note.menu').run({ noteId: 'n1' })
    expect(bus.emit).toHaveBeenCalledWith('toast:info', expect.stringContaining('3 words'))
  })

  it('random note opens one, and says so when there are none', async () => {
    const one = harness([{ id: 'n1', title: 'T', content: '' }])
    await one.actions.find((a) => a.slot === 'sidebar').run({})
    expect(one.bus.emit).toHaveBeenCalledWith('note:navigate', expect.objectContaining({ id: 'n1' }))
    const none = harness([])
    await none.actions.find((a) => a.slot === 'sidebar').run({})
    expect(none.bus.emit).toHaveBeenCalledWith('toast:info', expect.any(String))
  })
})
