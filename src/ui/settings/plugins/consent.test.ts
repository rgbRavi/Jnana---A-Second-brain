// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'

const dialog = vi.hoisted(() => ({
  showConfirmDialog: vi.fn(),
  showChoiceDialog: vi.fn(),
}))
const data = vi.hoisted(() => ({ createBackup: vi.fn() }))
vi.mock('../../../lib/dialog', () => dialog)
vi.mock('../../../core/data', () => data)

import { confirmPluginInstall } from './consent'
import type { PluginManifestPreview } from '../../../core/plugins/loader'

const manifest = (permissions: string[]) =>
  ({ id: 'x', name: 'Confetti', version: '1.0.0', runtime: 'main', type: 'utility', permissions }) as unknown as PluginManifestPreview

beforeEach(() => {
  vi.clearAllMocks()
  dialog.showConfirmDialog.mockResolvedValue(true)
})

describe('motion install step', () => {
  it('plugins without motion skip it', async () => {
    expect(await confirmPluginInstall(manifest(['notes']))).toBe(true)
    expect(dialog.showChoiceDialog).not.toHaveBeenCalled()
  })

  it('backs up first when asked, then installs', async () => {
    dialog.showChoiceDialog.mockResolvedValue('backup')
    data.createBackup.mockResolvedValue('C:/backups/b.zip')
    expect(await confirmPluginInstall(manifest(['motion']))).toBe(true)
    expect(data.createBackup).toHaveBeenCalledOnce()
  })

  it('a failed backup installs nothing', async () => {
    dialog.showChoiceDialog.mockResolvedValue('backup')
    data.createBackup.mockRejectedValue(new Error('disk full'))
    expect(await confirmPluginInstall(manifest(['motion']))).toBe(false)
  })

  it('install without backup, or cancel', async () => {
    dialog.showChoiceDialog.mockResolvedValue('install')
    expect(await confirmPluginInstall(manifest(['motion']))).toBe(true)
    dialog.showChoiceDialog.mockResolvedValue(null)
    expect(await confirmPluginInstall(manifest(['motion']))).toBe(false)
    expect(data.createBackup).not.toHaveBeenCalled()
  })

  it('declining the first prompt never reaches the second', async () => {
    dialog.showConfirmDialog.mockResolvedValue(false)
    expect(await confirmPluginInstall(manifest(['motion']))).toBe(false)
    expect(dialog.showChoiceDialog).not.toHaveBeenCalled()
  })
})
