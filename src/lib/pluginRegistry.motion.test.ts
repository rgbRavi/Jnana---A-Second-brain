// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }))

import { pluginRegistry } from './pluginRegistry'
import { eventBus } from './eventBus'
import { getSettingsDefinition } from './pluginContributions'
import { MAX_CLONES } from './motion/runtime'
import { resetPluginBudget } from '../core/plugins/guard'
import { motionPlugin } from '../plugins/motion'
import type { PluginContext } from './pluginApi'
import type { Plugin } from '../types'

function capture(id: string): { plugin: Plugin; ctx: () => PluginContext | undefined } {
  let seen: PluginContext | undefined
  return {
    plugin: { id, name: id, version: '1.0.0', init: (c) => void (seen = c) },
    ctx: () => seen,
  }
}

describe('ctx.motion', () => {
  afterEach(() => {
    for (const id of ['m.none', 'm.granted', 'm.layer']) pluginRegistry.unregister(id)
  })

  it('is handed out only with the motion permission', () => {
    const none = capture('m.none')
    pluginRegistry.register(none.plugin, { grantedPermissions: ['notes'] })
    expect(none.ctx()?.motion).toBeUndefined()

    const granted = capture('m.granted')
    pluginRegistry.register(granted.plugin, { grantedPermissions: ['motion'] })
    expect(granted.ctx()?.motion?.version).toBe(2)
  })

  it('unregister removes everything the plugin drew', () => {
    const p = capture('m.layer')
    pluginRegistry.register(p.plugin, { grantedPermissions: ['motion'] })
    p.ctx()?.motion?.overlay()
    expect(document.querySelectorAll('[data-motion-layer="m.layer"]')).toHaveLength(1)
    pluginRegistry.unregister('m.layer')
    expect(document.querySelectorAll('[data-motion-layer="m.layer"]')).toHaveLength(0)
  })

  it('a plugin whose init throws after drawing is disposed, not orphaned', () => {
    const thrower: Plugin = {
      id: 'm.thrower',
      name: 'm.thrower',
      version: '1.0.0',
      init(ctx) {
        ctx.motion?.overlay()
        throw new Error('boom')
      },
    }
    expect(() => pluginRegistry.register(thrower, { grantedPermissions: ['motion'] })).toThrow('boom')
    expect(document.querySelectorAll('[data-motion-layer="m.thrower"]')).toHaveLength(0)
    expect(pluginRegistry.isRegistered('m.thrower')).toBe(false)
  })
})

describe('built-in motion plugin under bulk delete', () => {
  afterEach(() => {
    pluginRegistry.unregister('jnana.motion')
    resetPluginBudget('jnana.motion')
  })

  it('throttles note:trashing so deleting many notes cannot trip the runaway limit', () => {
    document.body.innerHTML =
      '<div data-anchor="note" data-anchor-key="n1">note</div><button data-anchor="trash"></button>'
    Element.prototype.animate = vi.fn(() => ({
      cancel: vi.fn(),
      finished: new Promise(() => {}),
    })) as unknown as Element['animate']

    let runaway = false
    const onRunaway = () => void (runaway = true)
    eventBus.on('plugin:runaway', onRunaway)

    pluginRegistry.register(motionPlugin)
    // registerSettings runs synchronously inside init, before its one await
    // (reading stored settings) — the definition is already there.
    getSettingsDefinition('jnana.motion')?.onChange?.({ foldToBin: true, letterToNotes: false })

    for (let i = 0; i < 200; i++) eventBus.emit('note:trashing', { id: 'n1' })

    expect(runaway).toBe(false)
    expect(pluginRegistry.isRegistered('jnana.motion')).toBe(true)
    expect(document.querySelectorAll('[data-motion-layer="jnana.motion"]').length).toBeLessThanOrEqual(MAX_CLONES)

    eventBus.off('plugin:runaway', onRunaway)
  })
})
