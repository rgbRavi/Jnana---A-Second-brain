// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import { pluginKvList } from './storage'

/** Per-plugin storage footprint, derived from its plugin_kv rows. */
export interface PluginStorageUsage {
  keys: number
  bytes: number
}

export async function pluginStorageUsage(pluginId: string): Promise<PluginStorageUsage> {
  const rows = await pluginKvList(pluginId)
  let bytes = 0
  for (const [key, value] of Object.entries(rows)) bytes += key.length + value.length
  return { keys: Object.keys(rows).length, bytes }
}

export async function clearPluginStorage(pluginId: string): Promise<void> {
  await invoke<void>('plugin_kv_clear', { pluginId })
}

/** Scaffold a plugin project into `dir/<id>/`; returns the created path. */
export async function scaffoldPlugin(dir: string, id: string, name: string): Promise<string> {
  return invoke<string>('scaffold_plugin', { dir, id, name })
}
