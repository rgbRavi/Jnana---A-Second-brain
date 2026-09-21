// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// What each plugin has actually been doing this session — reads, writes and
// network requests, counted per plugin. Module store + useSyncExternalStore, like
// pluginLog.
//
// This is the honest mitigation for a trust model that can't confine a
// main-thread plugin: if it can't be stopped, it should at least be visible. The
// counters surface on the plugin's card in Settings → Plugins, and the Plugin
// Console carries the detail (which host, which note).

export interface PluginActivity {
  /** Reads of app data: notes fetched, searched. */
  reads: number
  /** Writes: note content saved, notes created. */
  writes: number
  /** Outbound HTTP requests made on the plugin's behalf. */
  requests: number
  /** When the plugin last did any of the above. */
  lastAt: number
}

const EMPTY: PluginActivity = { reads: 0, writes: 0, requests: 0, lastAt: 0 }

let activity: Record<string, PluginActivity> = {}
const listeners = new Set<() => void>()

export function recordPluginActivity(
  pluginId: string,
  kind: 'reads' | 'writes' | 'requests',
): void {
  const current = activity[pluginId] ?? EMPTY
  activity = {
    ...activity,
    [pluginId]: { ...current, [kind]: current[kind] + 1, lastAt: Date.now() },
  }
  listeners.forEach((l) => l())
}

export function getPluginActivity(): Record<string, PluginActivity> {
  return activity
}

export function activityOf(pluginId: string): PluginActivity {
  return activity[pluginId] ?? EMPTY
}

export function subscribePluginActivity(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Drop a plugin's counters (on unregister, so a reload starts clean). */
export function clearPluginActivity(pluginId: string): void {
  if (!activity[pluginId]) return
  const next = { ...activity }
  delete next[pluginId]
  activity = next
  listeners.forEach((l) => l())
}
