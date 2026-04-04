/**
 * Worker-side bus client. Call this inside your plugin's worker script.
 *
 * Usage:
 *   import { createWorkerBus } from '../../lib/pluginWorker'
 *   const bus = createWorkerBus()
 *   bus.on('note:saved', (note) => { ... })
 *   bus.emit('plugin:my-plugin:result', { ... })
 */
export function createWorkerBus() {
  const handlers = new Map<string, Array<(payload: unknown) => void>>()

  // Receive forwarded events from the main thread
  self.onmessage = (e: MessageEvent) => {
    const { type, event, payload } = e.data ?? {}
    if (type !== 'event') return
    const list = handlers.get(event)
    if (!list) return
    for (const h of list) {
      try {
        h(payload)
      } catch (err) {
        console.error(`[WorkerBus] Uncaught error in handler for "${event}":`, err)
      }
    }
  }

  return {
    /** Subscribe to an event from the main app. */
    on<T>(event: string, handler: (payload: T) => void): void {
      if (!handlers.has(event)) {
        handlers.set(event, [])
        // Tell the main thread to start forwarding this event
        self.postMessage({ type: 'subscribe', event })
      }
      handlers.get(event)!.push(handler as (payload: unknown) => void)
    },

    /** Emit a plugin-namespaced event back to the main app. */
    emit<T>(event: string, payload: T): void {
      self.postMessage({ type: 'emit', event, payload })
    },
  }
}
