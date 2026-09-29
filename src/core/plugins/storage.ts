// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import type { PluginStorage } from '../../lib/pluginApi'
import { guard } from './guard'

// Thin invoke wrappers over the Rust `plugin_kv_*` commands (v17). `value` is an
// opaque JSON string Rust-side; this layer handles JSON (de)serialization so a
// plugin works with plain objects.

export async function pluginKvGet(pluginId: string, key: string): Promise<string | null> {
  const v = await invoke<string | null>('plugin_kv_get', { pluginId, key })
  return v ?? null
}

export async function pluginKvSet(pluginId: string, key: string, value: string): Promise<void> {
  await invoke<void>('plugin_kv_set', { pluginId, key, value })
}

export async function pluginKvDelete(pluginId: string, key: string): Promise<void> {
  await invoke<void>('plugin_kv_delete', { pluginId, key })
}

export async function pluginKvList(pluginId: string): Promise<Record<string, string>> {
  const rows = await invoke<[string, string][]>('plugin_kv_list', { pluginId })
  return Object.fromEntries(rows)
}

/**
 * Build a `PluginStorage` bound to one plugin id (so callers never pass it).
 * Rate-limited like the other plugin APIs — a write loop here is a DB write loop.
 * Rust caps total size per plugin (5 MB).
 */
export function makePluginStorage(pluginId: string): PluginStorage {
  return {
    get<T = unknown>(key: string): Promise<T | null> {
      return guard(pluginId, 'reads', async () => {
        const raw = await pluginKvGet(pluginId, key)
        if (raw == null) return null
        try {
          return JSON.parse(raw) as T
        } catch {
          return null
        }
      })
    },
    set(key: string, value: unknown): Promise<void> {
      return guard(pluginId, 'writes', () => pluginKvSet(pluginId, key, JSON.stringify(value)))
    },
    delete(key: string): Promise<void> {
      return guard(pluginId, 'writes', () => pluginKvDelete(pluginId, key))
    },
    list(): Promise<Record<string, string>> {
      return guard(pluginId, 'reads', () => pluginKvList(pluginId))
    },
  }
}

/** Storage without the guard — for the host's own reads/writes of a plugin's
 *  settings, which are the user's actions, not the plugin's. */
export function hostPluginStorage(pluginId: string): PluginStorage {
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const raw = await pluginKvGet(pluginId, key)
      if (raw == null) return null
      try {
        return JSON.parse(raw) as T
      } catch {
        return null
      }
    },
    set: (key, value) => pluginKvSet(pluginId, key, JSON.stringify(value)),
    delete: (key) => pluginKvDelete(pluginId, key),
    list: () => pluginKvList(pluginId),
  }
}
