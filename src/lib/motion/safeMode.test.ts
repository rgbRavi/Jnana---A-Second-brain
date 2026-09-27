// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The boot flag is how a plugin that freezes Jnana at launch gets switched off
// without the user ever reaching Settings: a run that never proves healthy leaves
// 'pending' behind, and the next launch reads that as "last time went wrong".

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const KEY = 'jnana.motion.boot.v1'

async function fresh() {
  vi.resetModules()
  return import('./safeMode')
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('motion safe mode', () => {
  it('first launch is normal, and proves healthy after the window', async () => {
    const m = await fresh()
    m.beginMotionBoot()
    expect(m.isMotionSafeMode()).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('pending')
    vi.advanceTimersByTime(m.HEALTHY_MS)
    expect(localStorage.getItem(KEY)).toBe('ok')
  })

  it('a launch that never proved healthy puts the next one in safe mode', async () => {
    localStorage.setItem(KEY, 'pending')
    const m = await fresh()
    m.beginMotionBoot()
    expect(m.isMotionSafeMode()).toBe(true)
  })

  it('a render crash inside the window counts as unclean, even if the app keeps running', async () => {
    const m = await fresh()
    m.beginMotionBoot()
    m.markMotionBootFailed()
    vi.advanceTimersByTime(m.HEALTHY_MS)
    expect(localStorage.getItem(KEY)).toBe('failed')
    const next = await fresh()
    next.beginMotionBoot()
    expect(next.isMotionSafeMode()).toBe(true)
  })

  it('a crash after the window does not', async () => {
    const m = await fresh()
    m.beginMotionBoot()
    vi.advanceTimersByTime(m.HEALTHY_MS)
    m.markMotionBootFailed()
    expect(localStorage.getItem(KEY)).toBe('ok')
  })

  it('a clean close inside the window is healthy (dev reloads, quick quits)', async () => {
    const m = await fresh()
    m.beginMotionBoot()
    window.dispatchEvent(new Event('pagehide'))
    expect(localStorage.getItem(KEY)).toBe('ok')
  })

  it('tells the user once, however many plugins were skipped', async () => {
    const info = vi.fn()
    vi.doMock('../toast', () => ({ toast: { info } }))
    const m = await fresh()
    m.reportMotionPluginSkipped()
    m.reportMotionPluginSkipped()
    expect(info).toHaveBeenCalledOnce()
    vi.doUnmock('../toast')
  })
})
