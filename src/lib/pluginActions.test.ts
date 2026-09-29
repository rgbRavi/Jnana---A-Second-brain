// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }))

import { pluginRegistry } from './pluginRegistry'
import { toast } from './toast'
import { getPluginLog } from './pluginLog'
import {
  sanitizeAction,
  registerPluginAction,
  unregisterPluginActions,
  listPluginActions,
  runPluginAction,
  MAX_ACTIONS_PER_SLOT,
} from './pluginActions'

const action = (over: Partial<Parameters<typeof registerPluginAction>[2]> = {}) => ({
  id: 'a',
  slot: 'note.menu' as const,
  label: 'Do it',
  icon: '⭐',
  run: vi.fn(),
  ...over,
})

describe('plugin actions', () => {
  afterEach(() => {
    for (const id of ['p.one', 'p.two']) unregisterPluginActions(id)
  })

  it('validates plugin text: slot, id, label length, icon length', () => {
    expect(sanitizeAction({ id: 'a', slot: 'nowhere', label: 'x' })).toBeNull()
    expect(sanitizeAction({ id: 'bad id!', slot: 'sidebar', label: 'x' })).toBeNull()
    expect(sanitizeAction({ id: 'a', slot: 'sidebar', label: '   ' })).toBeNull()
    const long = sanitizeAction({ id: 'a', slot: 'sidebar', label: 'x'.repeat(500), icon: 'abcdef' })
    expect(long?.label).toHaveLength(40)
    expect(long?.icon).toBe('ab')
    expect(sanitizeAction({ id: 'a', slot: 'sidebar', label: '<b>hi</b>' })?.label).toBe('<b>hi</b>')
    expect(sanitizeAction({ id: 'a', slot: 'sidebar', label: 'x' })?.icon).toBe('🔌')
  })

  it('keeps at most MAX_ACTIONS_PER_SLOT per plugin per slot', () => {
    for (let i = 0; i < 10; i++) registerPluginAction('p.one', 'One', action({ id: `a${i}`, slot: 'sidebar' }))
    expect(listPluginActions('sidebar')).toHaveLength(MAX_ACTIONS_PER_SLOT)
    expect(getPluginLog().some((e) => e.pluginId === 'p.one' && e.level === 'warn' && e.message.includes('at most'))).toBe(true)
  })

  it('never cuts an emoji in half when trimming a label or icon', () => {
    const clipped = sanitizeAction({ id: 'a', slot: 'sidebar', label: 'x'.repeat(39) + '😀😀', icon: '❤️‍🔥🔥🔥' })
    expect(clipped?.label).toBe('x'.repeat(39) + '😀')
    expect(clipped?.icon).toBe('❤️‍🔥🔥')
  })

  it('replaces on re-register, keys by plugin + id, orders by plugin id', () => {
    registerPluginAction('p.two', 'Two', action({ label: 'Two' }))
    registerPluginAction('p.one', 'One', action({ label: 'First' }))
    registerPluginAction('p.one', 'One', action({ label: 'Renamed' }))
    expect(listPluginActions('note.menu').map((a) => a.label)).toEqual(['Renamed', 'Two'])
  })

  it('passes the target to run, and survives a throwing run', () => {
    const run = vi.fn()
    registerPluginAction('p.one', 'One', action({ run }))
    const stored = listPluginActions('note.menu')[0]
    runPluginAction(stored, { noteId: 'n1' })
    expect(run).toHaveBeenCalledWith({ noteId: 'n1' })

    const error = vi.spyOn(toast, 'error')
    registerPluginAction('p.one', 'One', action({ run: () => { throw new Error('boom') } }))
    expect(() => runPluginAction(listPluginActions('note.menu')[0], {})).not.toThrow()
    expect(error).toHaveBeenCalledWith("One: that didn't work.")
    expect(getPluginLog().some((e) => e.pluginId === 'p.one' && e.level === 'error' && e.message.includes('boom'))).toBe(true)
    error.mockRestore()
  })

  it('reports an async run that rejects, like a sync throw', async () => {
    const error = vi.spyOn(toast, 'error')
    registerPluginAction('p.one', 'One', action({ run: async () => { throw new Error('later') } }))
    runPluginAction(listPluginActions('note.menu')[0], {})
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith("One: that didn't work."))
    error.mockRestore()
  })

  it('a stale item from an unloaded plugin does nothing', () => {
    const run = vi.fn()
    registerPluginAction('p.one', 'One', action({ run }))
    const stale = listPluginActions('note.menu')[0]
    unregisterPluginActions('p.one')
    expect(listPluginActions('note.menu')).toHaveLength(0)
    runPluginAction(stale, {})
    expect(run).not.toHaveBeenCalled()
  })
})

describe('ctx.ui.registerAction (main thread)', () => {
  it('registers under the plugin and is torn down with it', () => {
    pluginRegistry.register(
      { id: 'p.main', name: 'Main', version: '1', init: (ctx) => ctx.ui.registerAction({ id: 'x', slot: 'sidebar', label: 'Hello', run: () => {} }) },
      { grantedPermissions: [] },
    )
    expect(listPluginActions('sidebar').map((a) => a.pluginName)).toContain('Main')
    pluginRegistry.unregister('p.main')
    expect(listPluginActions('sidebar').some((a) => a.pluginId === 'p.main')).toBe(false)
  })

  it('drops its actions when init throws after registering one', () => {
    expect(() =>
      pluginRegistry.register(
        {
          id: 'p.broken',
          name: 'Broken',
          version: '1',
          init: (ctx) => {
            ctx.ui.registerAction({ id: 'x', slot: 'sidebar', label: 'Orphan', run: () => {} })
            throw new Error('init failed')
          },
        },
        { grantedPermissions: [] },
      ),
    ).toThrow('init failed')
    expect(listPluginActions('sidebar').some((a) => a.pluginId === 'p.broken')).toBe(false)
  })
})
