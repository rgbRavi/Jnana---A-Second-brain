// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The rate limiter: a plugin gets a generous budget, a hot loop gets refused, and
// a plugin that will not stop gets handed to the registry to be switched off.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { chargePluginCall, guard, resetPluginBudget } from './guard'
import { eventBus } from '../../lib/eventBus'
import { activityOf, clearPluginActivity } from '../../lib/pluginActivity'

const ID = 'guard.test'
const ok = () => Promise.resolve('done')

describe('plugin rate limiting', () => {
  beforeEach(() => {
    resetPluginBudget(ID)
    clearPluginActivity(ID)
  })

  it('lets ordinary work through and counts it', async () => {
    for (let i = 0; i < 20; i++) await guard(ID, 'reads', ok)
    expect(activityOf(ID).reads).toBe(20)
    expect(await guard(ID, 'writes', ok)).toBe('done')
  })

  it('refuses a hot loop once the burst is spent', async () => {
    let refused = 0
    for (let i = 0; i < 200; i++) {
      // A tight loop can't wait for the bucket to refill, so it runs into the wall.
      await guard(ID, 'reads', ok).catch(() => refused++)
    }
    expect(refused).toBeGreaterThan(0)
  })

  it('caps how many calls can be in flight at once', async () => {
    const releases: Array<() => void> = []
    const blocked = () => new Promise<string>((resolve) => releases.push(() => resolve('done')))

    const inFlight = Array.from({ length: 6 }, () => guard(ID, 'reads', blocked))
    await expect(guard(ID, 'reads', ok)).rejects.toThrow(/in flight/)

    releases.forEach((release) => release())
    await Promise.allSettled(inFlight)
  })

  it('hands a plugin that will not stop to the registry', async () => {
    const runaway = vi.fn()
    eventBus.on('plugin:runaway', runaway)

    for (let i = 0; i < 400; i++) await guard(ID, 'reads', ok).catch(() => {})

    expect(runaway).toHaveBeenCalledWith(expect.objectContaining({ pluginId: ID }))
    eventBus.off('plugin:runaway', runaway)
  })
})

describe('chargePluginCall (synchronous registrations)', () => {
  it('refuses once the budget is gone, and disables a plugin that keeps going', () => {
    const id = 'com.test.spam'
    resetPluginBudget(id)
    const runaway = vi.fn()
    eventBus.on('plugin:runaway', runaway)

    // Registering UI is sync and returns nothing, so it can't go through `guard`
    // — but a loop of it re-renders the app as fast as the plugin can call.
    let allowed = 0
    for (let i = 0; i < 200; i++) if (chargePluginCall(id)) allowed += 1

    expect(allowed).toBeLessThan(200)
    expect(allowed).toBeGreaterThan(0)

    // Keep hammering past the strike limit and it is treated as runaway, exactly
    // like an async caller that ignores its refusals.
    for (let i = 0; i < 200; i++) chargePluginCall(id)
    expect(runaway).toHaveBeenCalled()

    eventBus.off('plugin:runaway', runaway)
    resetPluginBudget(id)
  })

  it('counts what it allowed as ui activity', () => {
    const id = 'com.test.counted'
    resetPluginBudget(id)
    clearPluginActivity(id)

    chargePluginCall(id)
    chargePluginCall(id)

    expect(activityOf(id).ui).toBe(2)
    clearPluginActivity(id)
    resetPluginBudget(id)
  })
})
