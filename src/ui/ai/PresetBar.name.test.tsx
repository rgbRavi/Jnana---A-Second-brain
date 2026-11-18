// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'

const m = vi.hoisted(() => ({ confirm: vi.fn().mockResolvedValue(false), error: vi.fn() }))
vi.mock('../../lib/dialog', () => ({ showConfirmDialog: m.confirm, showPromptDialog: vi.fn(), showChoiceDialog: vi.fn() }))
vi.mock('../../lib/toast', () => ({ toast: { error: m.error, success: vi.fn() } }))

import { checkSetupName } from './PresetBar'

describe('checkSetupName', () => {
  it('trims and accepts', async () => expect(await checkSetupName('  Local  ', [])).toBe('Local'))
  it('cancel is silent', async () => {
    expect(await checkSetupName(null, [])).toBeNull()
    expect(m.error).not.toHaveBeenCalled()
  })
  it('rejects whitespace-only with a message', async () => {
    expect(await checkSetupName('   ', [])).toBeNull()
    expect(m.error).toHaveBeenCalled()
  })
  it('rejects over 60 chars', async () => expect(await checkSetupName('x'.repeat(61), [])).toBeNull())
  it('asks before a duplicate', async () => {
    expect(await checkSetupName('local', ['Local'])).toBeNull()
    expect(m.confirm).toHaveBeenCalled()
  })
})
