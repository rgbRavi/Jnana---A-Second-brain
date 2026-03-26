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