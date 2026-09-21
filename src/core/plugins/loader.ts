// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import type { Plugin } from '../../types'
import { pluginRegistry } from '../../lib/pluginRegistry'
import { pluginLog } from '../../lib/pluginLog'
import { isPluginEnabled, setPluginEnabledState } from '../../lib/pluginEnabled'
import { rewritePluginImports } from './hostBridge'
import { spawnPluginWorker } from './workerHost'
import { policyRefusal } from '../../lib/pluginPolicy'

/**
 * A previewed package: its manifest plus the one-shot `consentToken` that
 * authorizes installing *this* package. Permissions are what the package itself
 * declares — the frontend never chooses a grant, it only shows one and confirms.
 */
export interface PluginManifestPreview {
  id: string
  name: string
  version: string
  description: string
  author: string
  main: string
  minAppVersion: string
  permissions: string[]
  /** Hosts the package declares it contacts (with the `network` permission). */
  hosts: string[]
  /** Its project/source page, shown before installing. */
  homepage: string
  /** "worker" (sandboxed) or "main". */
  runtime: string
  /** "theme" | "utility" — how the plugin describes itself. A label for grouping
   *  and consent copy; capabilities still come only from `permissions`. */
  type: string
  /** One-shot, ten-minute token; `installPlugin` consumes it. */
  consentToken: string
  /** SHA-256 of the fetched bytes (downloads only) — checked against the catalog. */
  sha256?: string
}

/** An installed third-party plugin, as reported by the Rust loader. */
export interface InstalledPlugin {
  id: string
  name: string
  version: string
  description: string
  author: string
  main: string
  minAppVersion: string
  /** Permissions the plugin requests. */
  permissions: string[]
  /** Permissions the user granted at install. */
  granted: string[]
  /** Hosts approved at install; empty unless `network` was granted. */
  hosts: string[]
  /** The plugin's project/source page, if its manifest gave one. */
  homepage: string
  /** "zip" | "local". */
  source: string
  /** "worker" runs the plugin in a Web Worker; anything else is main-thread. */
  runtime: string
  /** "theme" | "utility" (Rust fills in "utility" when the manifest omits it). */
  type: string
  /** Epoch ms when it was installed — the Installed list can sort on it. */
  installedAt: number
}

// ── Rust command wrappers ──

export function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>('list_installed_plugins')
}

/** Install the package a preview's token points at (the token carries the source
 *  and the granted permissions, so neither can be forged by a caller). */
export function installPlugin(consentToken: string): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>('install_plugin', { consentToken })
}

export function removeInstalledPlugin(id: string): Promise<void> {
  return invoke<void>('remove_plugin', { id })
}

export function packagePlugin(srcDir: string, destZip: string): Promise<string> {
  return invoke<string>('package_plugin', { srcDir, destZip })
}

export function readZipManifest(zipPath: string): Promise<PluginManifestPreview> {
  return invoke<PluginManifestPreview>('read_zip_manifest', { zipPath })
}

export function readLocalManifest(dir: string): Promise<PluginManifestPreview> {
  return invoke<PluginManifestPreview>('read_local_manifest', { dir })
}

/** Download (or read) a package and preview it without installing — returns its
 *  real manifest + the SHA-256 of the bytes, so the caller can check both against
 *  the catalog entry before asking the user. */
export function previewPluginDownload(downloadUrl: string): Promise<PluginManifestPreview> {
  return invoke<PluginManifestPreview>('preview_plugin_download', { downloadUrl })
}

/** Read an image a plugin ships (for its backdrop) as a `data:` URI. Rust keeps
 *  the read inside that plugin's own folder, to image types, and under 8 MB. */
export function readPluginFile(pluginId: string, path: string): Promise<string> {
  return invoke<string>('plugin_read_file', { pluginId, path })
}

function readPluginMain(id: string): Promise<string> {
  return invoke<string>('read_plugin_main', { id })
}

/**
 * Load one installed plugin: read its built entry, rewrite React imports to the
 * host shims, import it as a Blob module, and register it with its granted
 * permissions. Errors are logged (to the Plugin Console) rather than thrown — a
 * bad plugin must never break app boot.
 */
export async function loadInstalledPlugin(info: InstalledPlugin): Promise<boolean> {
  if (pluginRegistry.isRegistered(info.id)) return true
  // "Sandboxed plugins only" is a load-time gate, not an install-time one: turning
  // the policy on must take effect for plugins already on disk, not just new ones.
  const refusal = policyRefusal(info)
  if (refusal) {
    pluginLog('warn', refusal, info.id)
    return false
  }
  if (info.runtime === 'worker') return loadWorkerPlugin(info)
  let url: string | null = null
  try {
    const raw = await readPluginMain(info.id)
    const code = rewritePluginImports(raw)
    url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    const mod = (await import(/* @vite-ignore */ url)) as { default?: Plugin; plugin?: Plugin }
    const plugin = mod.default ?? mod.plugin
    if (!plugin || typeof plugin !== 'object' || plugin.id !== info.id) {
      throw new Error('did not export a default Plugin whose id matches its manifest')
    }
    pluginRegistry.register(plugin, { grantedPermissions: info.granted })
    return true
  } catch (err) {
    pluginLog('error', `Failed to load: ${err instanceof Error ? err.message : String(err)}`, info.id)
    console.error(`[loader] plugin "${info.id}" failed to load`, err)
    return false
  } finally {
    if (url) URL.revokeObjectURL(url)
  }
}

/**
 * Load a `"runtime": "worker"` plugin: its bundle goes into a Web Worker, and the
 * registry answers the capabilities it was granted over postMessage. No React
 * rewrite here — a worker has no DOM, so a bundle that imports react will fail to
 * load, and that failure is the correct answer rather than a silent half-load.
 */
async function loadWorkerPlugin(info: InstalledPlugin): Promise<boolean> {
  try {
    const code = await readPluginMain(info.id)
    const { worker, dispose } = spawnPluginWorker(code)
    pluginRegistry.registerWorker(
      { id: info.id, name: info.name, version: info.version, granted: info.granted },
      worker,
      dispose,
    )
    return true
  } catch (err) {
    pluginLog('error', `Failed to load: ${err instanceof Error ? err.message : String(err)}`, info.id)
    console.error(`[loader] worker plugin "${info.id}" failed to load`, err)
    return false
  }
}

/** Take permissions away from an installed plugin. Narrowing only — Rust refuses
 *  anything else — and the plugin is reloaded so its context loses the capability
 *  immediately, rather than at next launch. */
export async function revokePluginPermissions(
  info: InstalledPlugin,
  keep: string[],
): Promise<InstalledPlugin> {
  const updated = await invoke<InstalledPlugin>('revoke_plugin_permissions', {
    pluginId: info.id,
    keep,
  })
  pluginRegistry.unregister(info.id)
  if (isPluginEnabled(updated.id)) await loadInstalledPlugin(updated)
  return updated
}

/** Offer a permission back: previews the change (bounded by the plugin's own
 *  manifest) so the caller can confirm before `applyPluginGrant` commits it. */
export function previewPluginGrant(
  pluginId: string,
  permissions: string[],
): Promise<PluginManifestPreview> {
  return invoke<PluginManifestPreview>('preview_plugin_grant', { pluginId, permissions })
}

export async function applyPluginGrant(consentToken: string): Promise<InstalledPlugin> {
  const updated = await invoke<InstalledPlugin>('apply_plugin_grant', { consentToken })
  pluginRegistry.unregister(updated.id)
  if (isPluginEnabled(updated.id)) await loadInstalledPlugin(updated)
  return updated
}

/** Enable/disable an installed plugin live — persists the choice and loads or
 *  unloads it immediately (its note types appear/disappear at once). */
export async function setInstalledPluginEnabled(info: InstalledPlugin, enabled: boolean): Promise<void> {
  setPluginEnabledState(info.id, enabled)
  if (enabled) await loadInstalledPlugin(info)
  else pluginRegistry.unregister(info.id)
}

/** Load all enabled installed plugins. Called once at boot after the built-ins. */
export async function loadAllInstalledPlugins(): Promise<void> {
  let installed: InstalledPlugin[] = []
  try {
    installed = await listInstalledPlugins()
  } catch (err) {
    console.error('[loader] could not list installed plugins', err)
    return
  }
  // In parallel: each load is an IPC read plus a dynamic import, so a handful of
  // plugins loading one after another is boot time spent waiting. `loadInstalledPlugin`
  // never throws (it logs), so one bad plugin can't take the batch down.
  await Promise.all(
    installed.filter((info) => isPluginEnabled(info.id)).map((info) => loadInstalledPlugin(info)),
  )
}
