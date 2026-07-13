// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Persisted enabled/disabled state for plugins (a module store + localStorage,
// mirroring toast.ts / useComposerOptions). Stores the *disabled* set so a plugin
// is enabled by default. Read synchronously at boot (before React) to gate which
// built-in plugins register; the live toggle lives in src/plugins/index.ts.

const KEY = 'jnana.plugins.disabled.v1'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return new Set<string>(JSON.parse(raw) as string[])
  } catch {
    // ignore malformed storage
  }
  return new Set<string>()
}

let disabled: Set<string> = load()
const listeners = new Set<() => void>()

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...disabled]))
  } catch {
    // ignore quota/serialization errors
  }
}

export function isPluginEnabled(id: string): boolean {
  return !disabled.has(id)
}

/** Update persisted enabled state. Returns nothing; callers that also need to
 *  register/unregister the live plugin use `setPluginEnabled` in plugins/index. */
export function setPluginEnabledState(id: string, enabled: boolean): void {
  const next = new Set(disabled)
  if (enabled) next.delete(id)
  else next.add(id)
  disabled = next
  persist()
  listeners.forEach((l) => l())
}

export function subscribeEnabled(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Stable snapshot (identity changes only on mutation) for useSyncExternalStore. */
export function getDisabledSnapshot(): Set<string> {
  return disabled
}
