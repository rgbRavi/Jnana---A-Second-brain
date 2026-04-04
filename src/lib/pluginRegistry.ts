import type { Plugin } from '../types'
import { eventBus, PluginBus } from './eventBus'

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
    plugin.init?.(bus)
    this.buses.set(plugin.id, bus)
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
    }

    this.workerForwardCleanups.set(plugin.id, cleanups)
  }
}

export const pluginRegistry = new PluginRegistry()
