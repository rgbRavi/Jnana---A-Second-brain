// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Plugin } from '../types'
import { pluginRegistry } from '../lib/pluginRegistry'
import { isPluginEnabled, setPluginEnabledState } from '../lib/pluginEnabled'
import { loadAllInstalledPlugins } from '../core/plugins/loader'
import { flashcardsPlugin } from './flashcards'
import { pomodoroPlugin } from './pomodoro'
import { canvasPlugin } from './canvas'
import { quizPlugin } from './quiz'

/** Every first-party plugin bundled into the app (registered or not). The manager
 *  lists these so a disabled plugin still appears (and can be re-enabled). */
export const BUILTIN_PLUGINS: Plugin[] = [flashcardsPlugin, pomodoroPlugin, canvasPlugin, quizPlugin]

/**
 * Register all enabled first-party plugins. Called once at boot from `main.tsx`.
 * Skips plugins the user has disabled (persisted). Idempotent — `register` guards
 * duplicate ids, so it's safe under React StrictMode's double-invoke.
 */
export function registerBuiltinPlugins(): void {
  for (const plugin of BUILTIN_PLUGINS) {
    if (isPluginEnabled(plugin.id)) pluginRegistry.register(plugin)
  }
}

/** Enable/disable a built-in plugin *live* — persists the choice and registers or
 *  unregisters it immediately (note types appear/disappear at once). */
export function setPluginEnabled(id: string, enabled: boolean): void {
  setPluginEnabledState(id, enabled)
  const plugin = BUILTIN_PLUGINS.find((p) => p.id === id)
  if (!plugin) return
  if (enabled) pluginRegistry.register(plugin)
  else pluginRegistry.unregister(id)
}

/** Tear down and re-register everything (Developer → Reload) — built-ins *and*
 *  installed third-party plugins, which are re-read from disk, so a rebuilt local
 *  plugin picks up its new bundle. Unregistering all and re-registering only the
 *  built-ins would silently leave installed plugins dead until restart. */
export async function reloadAllPlugins(): Promise<void> {
  for (const plugin of pluginRegistry.getAll()) {
    pluginRegistry.unregister(plugin.id)
  }
  registerBuiltinPlugins()
  await loadAllInstalledPlugins()
}
