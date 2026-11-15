// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it, vi } from 'vitest'

vi.mock('../ipc', () => ({ invoke: vi.fn() }))

import { defaultConfig, hasWebSearch } from './config'

describe('hasWebSearch', () => {
  const base = defaultConfig()
  it('brave/tavily need a saved key', () => {
    expect(hasWebSearch({ ...base, webSearchProvider: 'brave' })).toBe(false)
    expect(hasWebSearch({ ...base, webSearchProvider: 'brave', hasWebSearchApiKey: true })).toBe(true)
    expect(hasWebSearch({ ...base, webSearchProvider: 'tavily', hasWebSearchApiKey: true })).toBe(true)
  })
  it('searxng needs a base URL', () => {
    expect(hasWebSearch({ ...base, webSearchProvider: 'searxng', webSearchBaseUrl: 'http://x' })).toBe(true)
    expect(hasWebSearch({ ...base, webSearchProvider: 'searxng', webSearchBaseUrl: ' ' })).toBe(false)
  })
})
