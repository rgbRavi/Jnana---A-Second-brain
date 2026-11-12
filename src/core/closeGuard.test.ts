// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'
import { registerCloseFlush, flushBeforeClose } from './closeGuard'

describe('closeGuard', () => {
  it('runs registered flushes, skips unregistered ones, survives a failing flush', async () => {
    const a = vi.fn(async () => {})
    const b = vi.fn(async () => {})
    const bad = vi.fn(async () => {
      throw new Error('disk full')
    })
    const offA = registerCloseFlush(a)
    const offB = registerCloseFlush(b)
    const offBad = registerCloseFlush(bad)
    offB()
    await flushBeforeClose()
    expect(a).toHaveBeenCalledOnce()
    expect(b).not.toHaveBeenCalled()
    expect(bad).toHaveBeenCalledOnce()
    offA()
    offBad()
  })

  it('gives up on a hung flush after the timeout', async () => {
    const off = registerCloseFlush(() => new Promise<void>(() => {}))
    const start = Date.now()
    await flushBeforeClose(30)
    expect(Date.now() - start).toBeLessThan(1000)
    off()
  })
})
