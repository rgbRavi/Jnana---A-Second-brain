// src/lib/toast.ts
//
// A tiny, dependency-free toast store. Importable from anywhere (components AND
// plain modules/hooks) — `toast.error('…')` — and rendered once by <Toaster />.
// Follows the same external-store pattern as the rest of the app (eventBus /
// useViewState): a module-level list + subscribe/getSnapshot for
// useSyncExternalStore. This replaces blocking native alert() dialogs.

export type ToastVariant = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
  /** Auto-dismiss after this many ms; 0 keeps it until dismissed. */
  duration: number
}

let toasts: Toast[] = []
const listeners = new Set<() => void>()
let nextId = 1

const emit = () => listeners.forEach((l) => l())

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Stable reference between mutations, as useSyncExternalStore requires. */
export function getToasts(): Toast[] {
  return toasts
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id)
  if (next.length === toasts.length) return
  toasts = next
  emit()
}

function push(message: string, variant: ToastVariant, duration: number): number {
  const id = nextId++
  toasts = [...toasts, { id, message: message.trim(), variant, duration }]
  emit()
  if (duration > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), duration)
  }
  return id
}

/**
 * Show a toast. `toast('msg')` defaults to an info toast; `toast.success(...)`
 * and `toast.error(...)` set the variant (errors linger a little longer).
 */
export const toast = Object.assign(
  (message: string, opts?: { variant?: ToastVariant; duration?: number }) =>
    push(message, opts?.variant ?? 'info', opts?.duration ?? 4000),
  {
    info: (message: string, duration = 4000) => push(message, 'info', duration),
    success: (message: string, duration = 4000) => push(message, 'success', duration),
    error: (message: string, duration = 6500) => push(message, 'error', duration),
  },
)
