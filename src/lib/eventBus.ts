// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Stringly-typed app-wide bus — no central event registry, just `emit`/`on`
// with a matching string. Notable events: `note:saved`/`note:opened`/
// `note:deleted`, `link:created`/`link:removed`, `annotation:created`/
// `:updated`/`:deleted`, `workspace:changed`, and `pdf:open`
// `{ filename, noteId, page, x, y }` — jump to a PDF reference pin, with
// (x, y) normalized 0-1 within the page. Also: `note:trashing { id }` (fired
// before the optimistic removal, so a motion plugin can still copy the card),
// `composer:saving { noteId }`, and `route:changed { path }` — plugins can
// listen to these but never emit them; `route:changed` also fires on the
// initial route mount (twice under StrictMode in dev), not only on navigation.
// Also plugin-listen-only: `note:created { id }`, `note:restored { id }`,
// `note:favourited { noteId, on }`, `note:tagged { id, tags }` (user tags),
// `quiz:completed { total, max }` (once, when the last question gets a mark).
// The labelled set motion plugins can claim lives in lib/motion/moments.ts.
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
  // Motion before-events: a plugin faking one would only fire animations, but
  // the app's own moments should mean the app did something.
  'note:trashing', 'composer:saving', 'route:changed',
  'note:created', 'note:restored', 'note:favourited', 'note:tagged', 'quiz:completed',
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