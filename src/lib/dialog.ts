// src/lib/dialog.ts
//
// A promise-based, in-app choice dialog — a modern replacement for blocking
// native window.prompt()/confirm() dialogs. Importable anywhere:
//
//   const choice = await showChoiceDialog({ title, message, options })
//
// Same module-store + useSyncExternalStore pattern as toast.ts. Rendered once by
// <DialogHost />. Resolves with the chosen option's `value`, or null if cancelled.

export interface DialogOption {
  value: string
  label: string
  description?: string
  icon?: string
  /** Emphasize as the recommended/default action (accent styling + autofocus). */
  primary?: boolean
}

export interface ChoiceDialog {
  title: string
  message?: string
  options: DialogOption[]
  cancelLabel?: string
}

interface ActiveDialog extends ChoiceDialog {
  id: number
  resolve: (value: string | null) => void
}

let current: ActiveDialog | null = null
const listeners = new Set<() => void>()
let nextId = 1

const emit = () => listeners.forEach((l) => l())

export function subscribeDialog(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Stable reference between mutations, as useSyncExternalStore requires. */
export function getDialog(): ActiveDialog | null {
  return current
}

function close(value: string | null): void {
  if (!current) return
  const { resolve } = current
  current = null
  emit()
  resolve(value)
}

/** Dismiss the open dialog, resolving its promise with `value` (null = cancel). */
export function resolveDialog(value: string | null): void {
  close(value)
}

/** Show a modal choice dialog; resolves with the chosen value or null if cancelled. */
export function showChoiceDialog(config: ChoiceDialog): Promise<string | null> {
  // Only one dialog at a time — cancel any in-flight one first.
  if (current) close(null)
  return new Promise<string | null>((resolve) => {
    current = { ...config, id: nextId++, resolve }
    emit()
  })
}
