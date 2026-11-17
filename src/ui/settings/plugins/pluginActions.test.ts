// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  remove: vi.fn(),
  clear: vi.fn(),
  unregister: vi.fn(),
}))

vi.mock('../../../core/plugins/loader', () => ({
  previewPluginDownload: vi.fn(),
  installPlugin: vi.fn(),
  loadInstalledPlugin: vi.fn(),
  removeInstalledPlugin: m.remove,
}))
vi.mock('../../../core/plugins/catalog', () => ({ verifyCatalogPackage: vi.fn() }))
vi.mock('../../../core/plugins/manager', () => ({ clearPluginStorage: m.clear }))
vi.mock('../../../core/plugins/updates', () => ({ invalidateUpdateCheck: vi.fn() }))
vi.mock('../../../lib/pluginRegistry', () => ({
  pluginRegistry: { unregister: m.unregister, isRegistered: () => true },
}))
vi.mock('../../../lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('../../../lib/logger', () => ({ log: { error: vi.fn() } }))
vi.mock('./consent', () => ({ confirmPluginInstall: vi.fn() }))

import { uninstallPlugin, isHttpUrl, upgradePlugin } from './pluginActions'
import { previewPluginDownload, installPlugin, type InstalledPlugin, type PluginManifestPreview } from '../../../core/plugins/loader'
import type { CatalogEntry } from '../../../core/plugins/catalog'
import { confirmPluginInstall } from './consent'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('uninstallPlugin', () => {
  it('keeps the plugin registered when removal fails', async () => {
    m.remove.mockRejectedValue(new Error('disk'))
    expect(await uninstallPlugin('a', false)).toEqual({ removed: false, purgeFailed: false })
    expect(m.unregister).not.toHaveBeenCalled()
  })

  it('reports a purge failure separately from the removal', async () => {
    m.remove.mockResolvedValue(undefined)
    m.clear.mockRejectedValue(new Error('db'))
    expect(await uninstallPlugin('a', true)).toEqual({ removed: true, purgeFailed: true })
    expect(m.unregister).toHaveBeenCalledWith('a')
  })
})

describe('isHttpUrl', () => {
  it('allows only http(s)', () => {
    expect(isHttpUrl('https://x.dev')).toBe(true)
    expect(isHttpUrl('file:///c:/x')).toBe(false)
    expect(isHttpUrl(undefined)).toBe(false)
  })
})

describe('upgradePlugin consent', () => {
  const entry = { id: 'p', downloadUrl: 'https://x/p.zip' } as CatalogEntry
  const prev = { id: 'p', author: 'Ada', granted: ['network'], hosts: ['a.dev'], runtime: 'worker' } as InstalledPlugin
  const pkg = (o: Partial<PluginManifestPreview>) =>
    ({ id: 'p', author: 'Ada', permissions: ['network'], hosts: ['a.dev'], runtime: 'worker', consentToken: 't', ...o }) as PluginManifestPreview
  const run = async (o: Partial<PluginManifestPreview>, opts?: { alwaysConfirm?: boolean }) => {
    vi.mocked(previewPluginDownload).mockResolvedValue(pkg(o))
    vi.mocked(confirmPluginInstall).mockResolvedValue(false)
    vi.mocked(installPlugin).mockRejectedValue(new Error('stop'))
    await upgradePlugin(entry, prev, opts)
    return vi.mocked(confirmPluginInstall).mock.calls.length > 0
  }

  it('skips the prompt for a same-scope update', async () => {
    expect(await run({})).toBe(false)
  })
  it('re-asks when the update adds a network host', async () => {
    expect(await run({ hosts: ['a.dev', 'b.dev'] })).toBe(true)
  })
  it('re-asks when the update leaves the sandbox', async () => {
    expect(await run({ runtime: 'main' })).toBe(true)
  })
  it('re-asks when a different publisher replaces the plugin', async () => {
    expect(await run({ author: 'Mallory' })).toBe(true)
  })
  it('always asks when the caller requires it (Browse)', async () => {
    expect(await run({}, { alwaysConfirm: true })).toBe(true)
  })
})
