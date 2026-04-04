type Handler<T = unknown> = (payload: T) => void

export class EventBus {
  private listeners = new Map<string, Handler[]>()

  on<T>(event: string, handler: Handler<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(handler as Handler)
  }

  off<T>(event: string, handler: Handler<T>): void {
    const handlers = this.listeners.get(event)
    if (!handlers) return
    this.listeners.set(event, handlers.filter(h => h !== handler))
  }

  emit<T>(event: string, payload: T): void {
    const handlers = this.listeners.get(event)
    if (!handlers) return
    handlers.forEach(h => h(payload))
  }

  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }
}

export const eventBus = new EventBus()

// Core app events plugins are never allowed to emit
const PLUGIN_BLOCKED_EVENTS = new Set([
  'note:saved', 'note:opened', 'note:deleted',
  'link:created', 'link:removed',
  'annotation:created', 'annotation:updated', 'annotation:deleted',
])

/**
 * Sandboxed event bus handed to each plugin.
 * - Cannot emit core app events
 * - Handlers are wrapped in try/catch so plugin errors don't propagate
 * - Tracks all subscriptions; call dispose() to auto-clean everything up
 */
export class PluginBus {
  private subscriptions: Array<{ event: string; safeHandler: Handler }> = []

  constructor(private bus: EventBus) {}

  on<T>(event: string, handler: (payload: T) => void): void {
    const safeHandler: Handler = (payload) => {
      try {
        handler(payload as T)
      } catch (err) {
        console.error(`[PluginBus] Uncaught error in handler for "${event}":`, err)
      }
    }
    this.subscriptions.push({ event, safeHandler })
    this.bus.on(event, safeHandler)
  }

  emit<T>(event: string, payload: T): void {
    if (PLUGIN_BLOCKED_EVENTS.has(event)) {
      console.warn(`[PluginBus] Blocked attempt to emit core event "${event}"`)
      return
    }
    this.bus.emit(event, payload)
  }

  dispose(): void {
    for (const { event, safeHandler } of this.subscriptions) {
      this.bus.off(event, safeHandler)
    }
    this.subscriptions = []
  }
}