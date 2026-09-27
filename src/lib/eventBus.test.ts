// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'
import { EventBus, PluginBus } from './eventBus'

describe('PluginBus', () => {
  it('forwards allowed events to listeners', () => {
    const bus = new EventBus()
    const pbus = new PluginBus(bus)
    const handler = vi.fn()
    bus.on('plugin:test', handler)
    pbus.emit('plugin:test', { x: 1 })
    expect(handler).toHaveBeenCalledWith({ x: 1 })
  })

  it('blocks core app events from being emitted', () => {
    const bus = new EventBus()
    const pbus = new PluginBus(bus)
    const handler = vi.fn()
    bus.on('note:deleted', handler)
    pbus.emit('note:deleted', { id: 'abc' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('catches handler errors without stopping other handlers', () => {
    const bus = new EventBus()
    const pbus = new PluginBus(bus)
    const second = vi.fn()
    pbus.on('note:saved', () => { throw new Error('plugin crash') })
    pbus.on('note:saved', second)
    expect(() => bus.emit('note:saved', {})).not.toThrow()
    expect(second).toHaveBeenCalled()
  })

  it('dispose removes all subscriptions', () => {
    const bus = new EventBus()
    const pbus = new PluginBus(bus)
    const handler = vi.fn()
    pbus.on('note:saved', handler)
    pbus.dispose()
    bus.emit('note:saved', {})
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('motion events', () => {
  it('plugins can hear but never fake the before-events', () => {
    const bus = new EventBus()
    const heard: unknown[] = []
    bus.on('note:trashing', (p) => heard.push(p))
    const pluginBus = new PluginBus(bus)
    pluginBus.emit('note:trashing', { id: 'x' })
    pluginBus.emit('composer:saving', { noteId: 'x' })
    pluginBus.emit('route:changed', { path: '/x' })
    expect(heard).toEqual([])
    bus.emit('note:trashing', { id: 'real' })
    expect(heard).toEqual([{ id: 'real' }])
  })
})
