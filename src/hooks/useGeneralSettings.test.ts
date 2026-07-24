// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGeneralSettings, setGeneralSettings } from './useGeneralSettings'

describe('useGeneralSettings store', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('returns defaults before anything is set', () => {
    const g = getGeneralSettings()
    expect(g.startupView).toBe('last')
    expect(g.confirmBeforeDelete).toBe(true)
    expect(g.dateFormat).toBe('locale')
    expect(g.weekStart).toBe('monday')
    expect(g.trashRetentionDays).toBe(30)
  })

  it('merges a partial patch and persists it', () => {
    setGeneralSettings({ confirmBeforeDelete: false })
    expect(getGeneralSettings().confirmBeforeDelete).toBe(false)
    // untouched fields keep defaults
    expect(getGeneralSettings().startupView).toBe('last')
    expect(localStorage.getItem('jnana.general.options')).toContain('"confirmBeforeDelete":false')
  })

  it('falls back to defaults when the stored JSON is corrupt', async () => {
    localStorage.setItem('jnana.general.options', '{ not valid json')
    // Re-import so the module-level load() re-runs against the corrupt value
    // and exercises its catch branch instead of throwing at import time.
    vi.resetModules()
    const mod = await import('./useGeneralSettings')
    expect(mod.getGeneralSettings().startupView).toBe('last')
  })

  it('keeps the in-memory value and does not throw when persistence fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(() => setGeneralSettings({ weekStart: 'sunday' })).not.toThrow()
    expect(getGeneralSettings().weekStart).toBe('sunday')
  })
})
