// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }))

import { pluginRegistry } from './pluginRegistry'
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
    expect(granted.ctx()?.motion?.version).toBe(1)
  })

  it('unregister removes everything the plugin drew', () => {
    const p = capture('m.layer')
    pluginRegistry.register(p.plugin, { grantedPermissions: ['motion'] })
    p.ctx()?.motion?.overlay()
    expect(document.querySelectorAll('[data-motion-layer="m.layer"]')).toHaveLength(1)
    pluginRegistry.unregister('m.layer')
    expect(document.querySelectorAll('[data-motion-layer="m.layer"]')).toHaveLength(0)
  })
})
