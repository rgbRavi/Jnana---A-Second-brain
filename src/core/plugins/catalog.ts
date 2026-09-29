// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import type { PluginManifestPreview } from './loader'

/** The official curated registry — the Browse tab defaults here so approved
 *  plugins appear with no setup. Editable per-user (see usePluginManager). */
export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/JnanaApp/JnanaPlugins/main/catalog.json'

/** A plugin as listed in a remote catalog index. */
export interface CatalogEntry {
  id: string
  name: string
  version: string
  description: string
  author: string
  downloadUrl: string
  permissions: string[]
  minAppVersion: string
  /** Optional SHA-256 (hex) of the package; verified before install when set. */
  sha256?: string
  /** "theme" when the listing says so; verified against the package, since Browse
   *  groups and filters on it. */
  type?: string
  /** "worker" when the listing claims the sandboxed runtime; verified against the
   *  package before install, so the badge can't overstate. */
  runtime?: string
  /** Project/source page, so a listing can be checked before it's trusted. */
  homepage?: string
  /** Hosts the listing says the plugin contacts; the package may not exceed them. */
  hosts?: string[]
}

/** Fetch + parse a catalog from an http(s) URL or a local file path. */
export function fetchPluginCatalog(url: string): Promise<CatalogEntry[]> {
  return invoke<CatalogEntry[]>('fetch_plugin_catalog', { url })
}

/**
 * Check a downloaded package against the catalog entry that advertised it, before
 * the user is asked to consent. Returns a human-readable reason to refuse, or
 * `null` when the package is what the entry claimed.
 *
 * Catches a listing whose zip carries a different id (which would install over
 * some *other* plugin's folder), a tampered/substituted download when the entry
 * publishes a hash, and a package that quietly asks for more than it advertised.
 */
export function verifyCatalogPackage(
  entry: CatalogEntry,
  pkg: PluginManifestPreview,
): string | null {
  if (pkg.id !== entry.id) {
    return `Package id "${pkg.id}" doesn't match the catalog entry "${entry.id}" — install refused.`
  }
  if (entry.sha256 && pkg.sha256 && entry.sha256.toLowerCase() !== pkg.sha256.toLowerCase()) {
    return `Download doesn't match the checksum published for ${entry.name} — install refused.`
  }
  const listed = new Set(entry.permissions ?? [])
  const extra = (pkg.permissions ?? []).filter((p) => !listed.has(p))
  if (extra.length > 0) {
    return `${entry.name} requests permissions its catalog entry doesn't list (${extra.join(', ')}) — install refused.`
  }
  const listedHosts = new Set(entry.hosts ?? [])
  const extraHosts = (pkg.hosts ?? []).filter((h) => !listedHosts.has(h))
  if (extraHosts.length > 0) {
    return `${entry.name} contacts hosts its catalog entry doesn't list (${extraHosts.join(', ')}) — install refused.`
  }
  // A listing that advertises the sandboxed runtime must actually ship it, or the
  // "Sandboxed" badge users choose by would be worth nothing.
  if ((entry.runtime ?? 'main') === 'worker' && pkg.runtime !== 'worker') {
    return `${entry.name} is listed as sandboxed but its package runs on the main thread — install refused.`
  }
  // Same reasoning for the type: a listing that says "theme" is what the user
  // filtered on and judged the permissions against, so the package has to agree.
  if ((entry.type ?? 'utility') !== (pkg.type || 'utility')) {
    return `${entry.name} is listed as a ${entry.type ?? 'utility'} plugin but its package says ${pkg.type || 'utility'} — install refused.`
  }
  return null
}

/** True when semver-ish `a` is strictly newer than `b` (numeric dot parts). */
export function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}
