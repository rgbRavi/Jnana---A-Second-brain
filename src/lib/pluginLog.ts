// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A small in-memory ring buffer of plugin lifecycle/error lines, surfaced by the
// Plugin Manager's Developer → Console. `pluginRegistry` writes to it (in addition
// to console) so the app has an in-app view of plugin activity without patching
// the global console.
//
// The buffer itself is a live dev aid: 300 lines, gone on restart. But anything
// at `warn` or `error` is **also** written to the rotating log file, because
// those are the lines someone needs the day *after* a plugin misbehaved — "it
// broke yesterday" is unanswerable from a buffer that died with the process.
// `info` stays in memory only: a hotkey press or a note read every few seconds
// would drown the app log in noise nobody asked for.

import { log } from './logger'

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
  if (level !== 'info') {
    const line = `[plugin${pluginId ? ` ${pluginId}` : ''}] ${message}`
    if (level === 'error') log.error(line)
    else log.warn(line)
  }
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
