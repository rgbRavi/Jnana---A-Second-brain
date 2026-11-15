// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { beforeEach, describe, expect, it, vi } from 'vitest'

const openUrl = vi.fn()
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: (u: string) => openUrl(u) }))
vi.mock('../ipc', () => ({ invoke: vi.fn() }))

import { openWebPage } from './web'

describe('openWebPage', () => {
  beforeEach(() => openUrl.mockReset())

  it('ignores non-http URLs', async () => {
    await openWebPage('javascript:x')
    expect(openUrl).not.toHaveBeenCalled()
    await openWebPage('https://a.b')
    expect(openUrl).toHaveBeenCalledTimes(1)
  })
})
