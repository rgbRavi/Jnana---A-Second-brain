// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import type { InstalledPlugin } from './loader'

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
}

/** Fetch + parse a catalog from an http(s) URL or a local file path. */
export function fetchPluginCatalog(url: string): Promise<CatalogEntry[]> {
  return invoke<CatalogEntry[]>('fetch_plugin_catalog', { url })
}

/** Download a plugin package from a URL (or local path) and install it. */
export function installFromUrl(downloadUrl: string, granted: string[]): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>('install_from_url', { downloadUrl, granted })
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
