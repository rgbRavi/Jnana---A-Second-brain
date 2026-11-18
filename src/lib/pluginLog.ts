// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Plugin lines, as seen by the Plugin Manager's Developer → Console. Not a log of
// its own any more: every line is an entry in the app log (lib/logger.ts) with
// category `plugin` and a pluginId, and this module is a filtered view of it — so
// the same lines also show up, with full context, in Settings → Developer.
//
// `origin` says who wrote the line: the host describing a plugin (lifecycle,
// rate limits — `app`), or the plugin itself through `ctx.log` / an uncaught
// worker error (`plugin`). The Developer Log shows the difference.
//
// File persistence is unchanged from the old ring buffer: warn/error reach the
// rotating log file (that's what someone needs the day *after* a plugin broke);
// info/debug stay in memory — a hotkey press or a note read every few seconds
// would drown the file in noise.

import { logEvent, clearLogEntries, getLogEntries, subscribeLog, type LogEntry, type LogSource } from './logger'
import type { PluginLogApi } from './pluginApi'

export type PluginLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface PluginLogEntry {
  id: number
  ts: number
  level: PluginLogLevel | 'trace' | 'fatal'
  pluginId?: string
  message: string
}

const MAX = 300

const isPluginEntry = (e: LogEntry): boolean => e.category === 'plugin'

export function pluginLog(level: PluginLogLevel, message: string, pluginId?: string, origin: LogSource = 'app'): void {
  logEvent(level, 'plugin', message, {
    pluginId,
    source: origin,
    persist: level === 'warn' || level === 'error',
  })
}

const PLUGIN_LEVELS: readonly PluginLogLevel[] = ['debug', 'info', 'warn', 'error']
const MAX_PLUGIN_MESSAGE = 1000

/**
 * A line a plugin wrote itself (`ctx.log.*`, or a worker's `log` message). Both
 * runtimes land here, so this is the trust boundary: the level is checked, the
 * text capped, and the data redacted + clipped by the logger. Write-only — no
 * plugin API can read, clear or rewrite the app log. Rate limiting is the
 * caller's job (`chargePluginCall` / the worker message budget).
 */
export function pluginWrite(pluginId: string, level: unknown, message: unknown, data?: unknown): void {
  const lvl = PLUGIN_LEVELS.includes(level as PluginLogLevel) ? (level as PluginLogLevel) : 'info'
  const text = String(message ?? '').slice(0, MAX_PLUGIN_MESSAGE)
  logEvent(lvl, 'plugin', text, {
    pluginId,
    source: 'plugin',
    ...(data instanceof Error ? { error: data } : { data }),
    persist: lvl === 'warn' || lvl === 'error',
  })
}

export interface PluginLogSlot extends PluginLogApi {
  /** Call with `ctx.log` in `init`, and with null in `destroy`. */
  bind(log: PluginLogApi | null): void
}

/**
 * For a built-in plugin whose views/editors live outside `init(ctx)`: bind
 * `ctx.log` once at init and log from anywhere through the slot, so every line
 * still goes through the plugin's own (budget-charged, plugin-tagged) logger.
 * Lines while the plugin is off are dropped — nothing of it is running then.
 */
export function pluginLogSlot(): PluginLogSlot {
  let current: PluginLogApi | null = null
  const at = (level: keyof PluginLogApi) => (message: string, data?: unknown) => current?.[level](message, data)
  return {
    bind: (log) => {
      current = log
    },
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
  }
}

export function clearPluginLog(): void {
  clearLogEntries(isPluginEntry)
}

export function subscribePluginLog(listener: () => void): () => void {
  return subscribeLog(listener)
}

let lastAll: LogEntry[] | null = null
let lastView: PluginLogEntry[] = []

/** Stable snapshot (identity changes only when the underlying log does). */
export function getPluginLog(): PluginLogEntry[] {
  const all = getLogEntries()
  if (all !== lastAll) {
    lastAll = all
    const next = all.filter(isPluginEntry).slice(-MAX)
    // Same lines → same array, so an unrelated app entry doesn't re-render the console.
    if (next.length !== lastView.length || next[next.length - 1]?.id !== lastView[lastView.length - 1]?.id || next[0]?.id !== lastView[0]?.id) {
      lastView = next
    }
  }
  return lastView
}
