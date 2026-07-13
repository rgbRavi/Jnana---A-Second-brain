// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import type { Plugin } from '../../types'
import { pluginRegistry } from '../../lib/pluginRegistry'
import { pluginLog } from '../../lib/pluginLog'
import { isPluginEnabled, setPluginEnabledState } from '../../lib/pluginEnabled'
import { rewritePluginImports } from './hostBridge'

/** A plugin manifest as previewed before install (drives the consent prompt). */
export interface PluginManifestPreview {
  id: string
  name: string
  version: string
  description: string
  author: string
  permissions: string[]
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
  /** "zip" | "local". */
  source: string
}

// ── Rust command wrappers ──

export function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>('list_installed_plugins')
}

export function installPluginZip(zipPath: string, granted: string[]): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>('install_plugin_zip', { zipPath, granted })
}

export function installLocalPlugin(dir: string, granted: string[]): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>('install_local_plugin', { dir, granted })
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
  for (const info of installed) {
    if (isPluginEnabled(info.id)) await loadInstalledPlugin(info)
  }
}
