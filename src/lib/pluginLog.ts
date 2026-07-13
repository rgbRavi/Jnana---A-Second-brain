// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A small in-memory ring buffer of plugin lifecycle/error lines, surfaced by the
// Plugin Manager's Developer → Console. `pluginRegistry` writes to it (in addition
// to console) so the app has an in-app view of plugin activity without patching
// the global console. Not persisted — it's a live dev aid.

export type PluginLogLevel = 'info' | 'warn' | 'error'

export interface PluginLogEntry {
  id: number
  ts: number
  level: PluginLogLevel
  pluginId?: string
  message: string
}

const MAX = 300
let entries: PluginLogEntry[] = []
let seq = 0
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

export function pluginLog(level: PluginLogLevel, message: string, pluginId?: string): void {
  seq += 1
  const entry: PluginLogEntry = { id: seq, ts: Date.now(), level, pluginId, message }
  entries = [...entries.slice(-(MAX - 1)), entry]
  emit()
}

export function clearPluginLog(): void {
  entries = []
  emit()
}

export function subscribePluginLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Stable snapshot (identity changes only on mutation) for useSyncExternalStore. */
export function getPluginLog(): PluginLogEntry[] {
  return entries
}
