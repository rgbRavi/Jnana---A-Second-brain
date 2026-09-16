// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import { resolveSettingsTab } from './settingsTabs'

describe('resolveSettingsTab', () => {
  it('defaults the settings landing view to AI', () => {
    expect(resolveSettingsTab('/settings')).toBe('ai')
  })

  it('maps the dedicated AI route to the AI tab', () => {
    expect(resolveSettingsTab('/settings/ai')).toBe('ai')
  })

  it('keeps advanced AI on its own tab', () => {
    expect(resolveSettingsTab('/settings/advanced-ai')).toBe('advanced-ai')
  })
})
