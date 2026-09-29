// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Buttons and menu items a plugin puts into Jnana's own UI. The plugin *describes*
// the item (slot, label, glyph); Jnana validates it and draws it in its own style,
// so this works the same for a sandboxed worker plugin as for a main-thread one.
// Plugin text is untrusted: trimmed and capped here, rendered as text only.

import { pluginLog } from './pluginLog'
import { toast } from './toast'

export type PluginActionSlot = 'note.menu' | 'editor.toolbar' | 'sidebar'
export const ACTION_SLOTS: readonly PluginActionSlot[] = ['note.menu', 'editor.toolbar', 'sidebar']
export const MAX_ACTIONS_PER_SLOT = 3
const MAX_LABEL = 40
const MAX_ICON = 2
const DEFAULT_ICON = '🔌'
const SAFE_ID = /^[\w.:-]{1,64}$/

export interface PluginActionTarget {
  noteId?: string
}

export interface PluginAction {
  id: string
  slot: PluginActionSlot
  label: string
  icon?: string
  run: (target: PluginActionTarget) => void
}

export interface StoredAction {
  pluginId: string
  pluginName: string
  id: string
  slot: PluginActionSlot
  label: string
  icon: string
  run: (target: PluginActionTarget) => void
}

// Keyed `${pluginId}\u0000${id}` so two plugins can reuse an action id.
const actions = new Map<string, StoredAction>()
const key = (pluginId: string, id: string) => `${pluginId}\u0000${id}`

let version = 0
let pending = false
const listeners = new Set<() => void>()
function changed(): void {
  version += 1
  if (pending) return
  pending = true
  queueMicrotask(() => {
    pending = false
    listeners.forEach((l) => l())
  })
}

export function subscribeActions(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getActionsVersion(): number {
  return version
}

export function sanitizeAction(
  input: unknown,
): Omit<StoredAction, 'pluginId' | 'pluginName' | 'run'> | null {
  if (!input || typeof input !== 'object') return null
  const { id, slot, label, icon } = input as Record<string, unknown>
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return null
  if (typeof slot !== 'string' || !ACTION_SLOTS.includes(slot as PluginActionSlot)) return null
  if (typeof label !== 'string' || !label.trim()) return null
  const glyph = typeof icon === 'string' && icon.trim() ? Array.from(icon.trim()).slice(0, MAX_ICON).join('') : DEFAULT_ICON
  return { id, slot: slot as PluginActionSlot, label: label.trim().slice(0, MAX_LABEL), icon: glyph }
}

/** Store (or replace) a plugin's action. False when refused — invalid, or the
 *  plugin already has MAX_ACTIONS_PER_SLOT in that slot. */
export function registerPluginAction(pluginId: string, pluginName: string, action: PluginAction): boolean {
  const clean = sanitizeAction(action)
  if (!clean || typeof action.run !== 'function') {
    pluginLog('warn', 'Action refused — needs an id, a known slot and a label', pluginId)
    return false
  }
  const k = key(pluginId, clean.id)
  const inSlot = [...actions.values()].filter((a) => a.pluginId === pluginId && a.slot === clean.slot)
  if (!actions.has(k) && inSlot.length >= MAX_ACTIONS_PER_SLOT) {
    pluginLog('warn', `Action refused — at most ${MAX_ACTIONS_PER_SLOT} per slot ("${clean.slot}")`, pluginId)
    return false
  }
  actions.set(k, { ...clean, pluginId, pluginName, run: action.run })
  changed()
  return true
}

export function unregisterPluginActions(pluginId: string): void {
  let removed = false
  for (const [k, a] of actions) {
    if (a.pluginId === pluginId) {
      actions.delete(k)
      removed = true
    }
  }
  if (removed) changed()
}

export function listPluginActions(slot: PluginActionSlot): StoredAction[] {
  return [...actions.values()]
    .filter((a) => a.slot === slot)
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId))
}

/** Click handler. A stale item (plugin unloaded since the menu opened) does
 *  nothing; a throwing one is reported, never rethrown into the menu. */
export function runPluginAction(action: StoredAction, target: PluginActionTarget): void {
  if (actions.get(key(action.pluginId, action.id)) !== action) return
  const fail = (err: unknown) => {
    pluginLog('error', `Action "${action.label}" failed: ${err instanceof Error ? err.message : String(err)}`, action.pluginId)
    toast.error(`${action.pluginName}: that didn't work.`)
  }
  try {
    // An async run's rejection is reported the same as a sync throw.
    void Promise.resolve(action.run(target)).catch(fail)
  } catch (err) {
    fail(err)
  }
}
