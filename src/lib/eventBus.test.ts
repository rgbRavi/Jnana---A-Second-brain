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
