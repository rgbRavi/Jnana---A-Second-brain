// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { listInstalledPlugins } from './loader'
import { fetchPluginCatalog, isNewerVersion } from './catalog'
import { log } from '../../lib/logger'

// Background update awareness. The Updates tab only ever checked when opened, so a
// plugin with a fix could sit stale indefinitely — nobody opens that tab to find
// nothing. This checks once a day at launch, counts what's upgradable, and lets
// the Plugins nav carry a badge.
//
// Deliberately passive: it never installs anything. An update runs new code, so it
// stays a decision the user makes (and re-consents to, when the new version wants
// more than the old one).

const LAST_CHECK_KEY = 'jnana.plugins.updates.lastCheck.v1'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

let outdated: string[] = []
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

/** Ids of installed plugins with a newer version in the catalog. */
export function getOutdatedPlugins(): string[] {
  return outdated
}

export function subscribePluginUpdates(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Let a fresh check happen now (the Updates tab, after installing something). */
export function invalidateUpdateCheck(): void {
  try {
    localStorage.removeItem(LAST_CHECK_KEY)
  } catch {
    /* storage unavailable */
  }
}

export function setOutdatedPlugins(ids: string[]): void {
  const changed = ids.length !== outdated.length || ids.some((id, i) => id !== outdated[i])
  outdated = ids
  if (changed) emit()
}

function dueForCheck(): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0)
    return !Number.isFinite(last) || Date.now() - last > CHECK_INTERVAL_MS
  } catch {
    return true
  }
}

/**
 * Check the catalog for newer versions of installed plugins. Throttled to once a
 * day unless `force` is set; never throws — a registry that's unreachable at
 * launch is normal, not an error worth surfacing.
 */
export async function checkPluginUpdates(catalogUrl: string, force = false): Promise<string[]> {
  if (!catalogUrl.trim()) return []
  if (!force && !dueForCheck()) return outdated
  try {
    const [installed, catalog] = await Promise.all([
      listInstalledPlugins(),
      fetchPluginCatalog(catalogUrl.trim()),
    ])
    const byId = new Map(catalog.map((e) => [e.id, e]))
    const found = installed
      .filter((p) => {
        const entry = byId.get(p.id)
        return entry && isNewerVersion(entry.version, p.version)
      })
      .map((p) => p.id)
    setOutdatedPlugins(found)
    try {
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()))
    } catch {
      /* storage unavailable */
    }
    return found
  } catch (err) {
    log.warn?.('plugin update check failed', err)
    return outdated
  }
}
