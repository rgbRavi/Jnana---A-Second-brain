// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

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
  /** 0..1 → render a determinate progress bar at the toast's foot; undefined → none. */
  progress?: number
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

function push(message: string, variant: ToastVariant, duration: number, progress?: number): number {
  const id = nextId++
  toasts = [...toasts, { id, message: message.trim(), variant, duration, progress }]
  emit()
  if (duration > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), duration)
  }
  return id
}

/**
 * Patch a live toast (e.g. advance a progress bar, or flip a progress toast to a
 * success message and give it an auto-dismiss). Passing a positive `duration`
 * (re)arms the auto-dismiss timer, so a persistent progress toast can be resolved
 * into a self-dismissing notification.
 */
export function updateToast(id: number, patch: Partial<Omit<Toast, 'id'>>): void {
  let found = false
  toasts = toasts.map((t) => {
    if (t.id !== id) return t
    found = true
    return { ...t, ...patch, message: patch.message != null ? patch.message.trim() : t.message }
  })
  if (!found) return
  emit()
  if (patch.duration != null && patch.duration > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), patch.duration)
  }
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
    /** A persistent (duration 0) progress toast; advance it with `updateToast`. */
    progress: (message: string, progress = 0) => push(message, 'info', 0, progress),
  },
)
