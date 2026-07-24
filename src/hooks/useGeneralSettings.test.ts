// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { beforeEach, describe, expect, it } from 'vitest'
import { getGeneralSettings, setGeneralSettings } from './useGeneralSettings'

describe('useGeneralSettings store', () => {
  beforeEach(() => localStorage.clear())

  it('returns defaults before anything is set', () => {
    const g = getGeneralSettings()
    expect(g.startupView).toBe('last')
    expect(g.confirmBeforeDelete).toBe(true)
    expect(g.dateFormat).toBe('locale')
    expect(g.weekStart).toBe('monday')
  })

  it('merges a partial patch and persists it', () => {
    setGeneralSettings({ confirmBeforeDelete: false })
    expect(getGeneralSettings().confirmBeforeDelete).toBe(false)
    // untouched fields keep defaults
    expect(getGeneralSettings().startupView).toBe('last')
    expect(localStorage.getItem('jnana.general.options')).toContain('"confirmBeforeDelete":false')
  })
})
