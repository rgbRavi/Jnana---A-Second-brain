// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import {
  previewPluginDownload,
  installPlugin,
  loadInstalledPlugin,
  removeInstalledPlugin,
  type InstalledPlugin,
} from '../../../core/plugins/loader'
import { verifyCatalogPackage, type CatalogEntry } from '../../../core/plugins/catalog'
import { clearPluginStorage } from '../../../core/plugins/manager'
import { invalidateUpdateCheck } from '../../../core/plugins/updates'
import { pluginRegistry } from '../../../lib/pluginRegistry'
import { toast } from '../../../lib/toast'
import { log } from '../../../lib/logger'
import { confirmPluginInstall } from './consent'

export type UpgradeOutcome = 'done' | 'skipped' | 'failed'

/**
 * Install a catalog entry, or upgrade an installed plugin to it. One path for Browse
 * and Updates. Download, verify and consent all happen before anything live is
 * touched, and the old version is only unregistered once the new one is on disk — so a
 * failed download/install leaves the running plugin alone.
 *
 * `previous` is the installed plugin being replaced (omit for a fresh install, which
 * always asks). An upgrade only re-asks when it widens what the plugin may do, or
 * when the caller passes `alwaysConfirm` (Browse: the installed copy may have come
 * from a local zip by a different publisher, and `source` can't tell catalog from zip).
 */
export async function upgradePlugin(
  entry: CatalogEntry,
  previous?: InstalledPlugin,
  opts: { alwaysConfirm?: boolean } = {},
): Promise<UpgradeOutcome> {
  let stage: 'download' | 'install' = 'download'
  try {
    const pkg = await previewPluginDownload(entry.downloadUrl)
    const problem = verifyCatalogPackage(entry, pkg)
    if (problem) {
      toast.error(problem)
      return 'skipped'
    }
    // Widening = a new permission, a new network host, leaving the sandbox
    // (worker → main thread is a trust escalation even with identical permissions),
    // or a different publisher replacing the installed plugin.
    const widened = previous
      ? opts.alwaysConfirm === true ||
        pkg.permissions.some((p) => !previous.granted.includes(p)) ||
        (pkg.permissions.includes('network') && (pkg.hosts ?? []).some((h) => !previous.hosts.includes(h))) ||
        (previous.runtime === 'worker' && pkg.runtime !== 'worker') ||
        (pkg.author ?? '').trim().toLowerCase() !== (previous.author ?? '').trim().toLowerCase()
      : true
    if (widened && !(await confirmPluginInstall(pkg))) return 'skipped'
    stage = 'install'
    const info = await installPlugin(pkg.consentToken)
    // Swap only now: loadInstalledPlugin is a no-op while the old one is registered.
    if (pluginRegistry.isRegistered(info.id)) pluginRegistry.unregister(info.id)
    const ok = await loadInstalledPlugin(info)
    const verb = previous ? 'Updated' : 'Installed'
    toast.success(
      ok
        ? previous
          ? `Updated ${info.name} to v${info.version}.`
          : `Installed ${info.name}.`
        : `${verb} ${info.name}, but it couldn't start. To see why, turn on General → Show developer options, then open Plugins → Plugin development.`,
    )
    invalidateUpdateCheck()
    return 'done'
  } catch (err) {
    log.error(previous ? 'plugin update failed' : 'plugin install failed', err)
    toast.error(
      stage === 'download'
        ? "Couldn't download this plugin. Check your internet connection and try again."
        : `Couldn't ${previous ? 'update' : 'install'} this plugin. Check that your disk isn't full, then try again.`,
    )
    return 'failed'
  }
}

export interface UninstallResult {
  /** The plugin is gone from disk. */
  removed: boolean
  /** It was removed, but its stored data couldn't be deleted. */
  purgeFailed: boolean
}

/** Remove first, unregister second: if removal fails the plugin keeps running. */
export async function uninstallPlugin(id: string, purge: boolean): Promise<UninstallResult> {
  try {
    await removeInstalledPlugin(id)
  } catch (err) {
    log.error('plugin uninstall failed', err)
    return { removed: false, purgeFailed: false }
  }
  pluginRegistry.unregister(id)
  if (!purge) return { removed: true, purgeFailed: false }
  try {
    await clearPluginStorage(id)
    return { removed: true, purgeFailed: false }
  } catch (err) {
    log.error('plugin data purge failed', err)
    return { removed: true, purgeFailed: true }
  }
}

/** Only http(s) links are opened from plugin-supplied metadata. */
export function isHttpUrl(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url.trim())
}
