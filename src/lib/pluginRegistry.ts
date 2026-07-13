// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Plugin } from '../types'
import { eventBus, PluginBus } from './eventBus'
import { registerNoteType, unregisterNoteType } from './noteTypes'
import { pluginLog } from './pluginLog'
import { makePluginStorage } from '../core/plugins/storage'
import { makePluginNotesApi } from '../core/plugins/notesApi'

// Core app events that worker plugins are not allowed to emit
const WORKER_BLOCKED_EVENTS = new Set([
  'note:saved', 'note:opened', 'note:deleted',
  'link:created', 'link:removed',
  'annotation:created', 'annotation:updated', 'annotation:deleted',
])

class PluginRegistry {
  private plugins = new Map<string, Plugin>()
  private buses = new Map<string, PluginBus>()
  private workers = new Map<string, Worker>()
  // tracks per-worker which events have been forwarded so we can clean up
  private workerForwardCleanups = new Map<string, Array<() => void>>()
  // note types each inline plugin registered, so unregister can tear them down
  private pluginNoteTypes = new Map<string, string[]>()

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin "${plugin.id}" is already registered`)
      return
    }

    if (plugin.worker && plugin.workerUrl) {
      this._registerWorkerPlugin(plugin)
    } else {
      this._registerInlinePlugin(plugin)
    }

    this.plugins.set(plugin.id, plugin)
    eventBus.emit('plugin:registered', { id: plugin.id })
    console.log(`Plugin "${plugin.name}" v${plugin.version} loaded`)
    pluginLog('info', `Loaded v${plugin.version}`, plugin.id)
  }

  /** Ids of the note types a (registered) plugin contributed — drives the manager's
   *  "Provides" line. Empty for a plugin that's unregistered or contributes none. */
  noteTypeIdsOf(id: string): string[] {
    return this.pluginNoteTypes.get(id) ?? []
  }

  isRegistered(id: string): boolean {
    return this.plugins.has(id)
  }

  unregister(id: string): void {
    const plugin = this.plugins.get(id)
    if (!plugin) return

    // Clean up inline plugin
    const bus = this.buses.get(id)
    if (bus) {
      plugin.destroy?.()
      bus.dispose()
      this.buses.delete(id)
    }
    // Remove any note types this plugin registered.
    const kinds = this.pluginNoteTypes.get(id)
    if (kinds) {
      kinds.forEach(unregisterNoteType)
      this.pluginNoteTypes.delete(id)
    }
    pluginLog('info', 'Unloaded', id)

    // Clean up worker plugin
    const worker = this.workers.get(id)
    if (worker) {
      const cleanups = this.workerForwardCleanups.get(id) ?? []
      cleanups.forEach(fn => fn())
      this.workerForwardCleanups.delete(id)
      worker.terminate()
      this.workers.delete(id)
    }

    this.plugins.delete(id)
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id)
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values())
  }

  private _registerInlinePlugin(plugin: Plugin): void {
    const bus = new PluginBus(eventBus)
    const registeredKinds: string[] = []
    plugin.init?.({
      pluginId: plugin.id,
      bus,
      storage: makePluginStorage(plugin.id),
      notes: makePluginNotesApi(),
      registerNoteType: (def) => {
        registerNoteType(def)
        registeredKinds.push(def.id)
      },
    })
    this.buses.set(plugin.id, bus)
    this.pluginNoteTypes.set(plugin.id, registeredKinds)
  }

  private _registerWorkerPlugin(plugin: Plugin): void {
    const worker = new Worker(plugin.workerUrl!, { type: 'module' })
    this.workers.set(plugin.id, worker)

    const cleanups: Array<() => void> = []

    // Worker → main: handle subscribe and emit requests
    worker.onmessage = (e: MessageEvent) => {
      const { type, event, payload } = e.data ?? {}

      if (type === 'subscribe') {
        // Forward this event from the real bus into the worker
        const forwardHandler = (p: unknown) => {
          worker.postMessage({ type: 'event', event, payload: p })
        }
        eventBus.on(event, forwardHandler)
        cleanups.push(() => eventBus.off(event, forwardHandler))

      } else if (type === 'emit') {
        if (WORKER_BLOCKED_EVENTS.has(event)) {
          console.warn(`[PluginRegistry] Worker plugin "${plugin.id}" blocked from emitting "${event}"`)
          return
        }
        eventBus.emit(event, payload)
      }
    }

    worker.onerror = (err) => {
      console.error(`[PluginRegistry] Worker plugin "${plugin.id}" threw an error:`, err)
      pluginLog('error', `Worker error: ${err.message ?? 'unknown'}`, plugin.id)
    }

    this.workerForwardCleanups.set(plugin.id, cleanups)
  }
}

export const pluginRegistry = new PluginRegistry()
