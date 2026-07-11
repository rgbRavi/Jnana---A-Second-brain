// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/lib/dialog.ts
//
// Promise-based, in-app dialogs — a modern replacement for blocking native
// window.prompt()/confirm() dialogs. Importable anywhere:
//
//   const choice  = await showChoiceDialog({ title, options })   // pick a card
//   const text    = await showPromptDialog({ title, placeholder }) // text input
//   const ok      = await showConfirmDialog({ title, message })    // yes / no
//
// Same module-store + useSyncExternalStore pattern as toast.ts. Rendered once by
// <DialogHost />. Choice/prompt resolve with a string or null (cancelled);
// confirm resolves with a boolean.

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

export interface PromptDialog {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
}

export interface ConfirmDialog {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm button as destructive. */
  danger?: boolean
}

interface Base {
  id: number
  resolve: (value: string | null) => void
}

export type ActiveDialog =
  | ({ kind: 'choice' } & ChoiceDialog & Base)
  | ({ kind: 'prompt' } & PromptDialog & Base)
  | ({ kind: 'confirm' } & ConfirmDialog & Base)

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

function present(make: (base: Base) => ActiveDialog): Promise<string | null> {
  // Only one dialog at a time — cancel any in-flight one first.
  if (current) close(null)
  return new Promise<string | null>((resolve) => {
    current = make({ id: nextId++, resolve })
    emit()
  })
}

/** Show a card-picker dialog; resolves with the chosen value or null if cancelled. */
export function showChoiceDialog(config: ChoiceDialog): Promise<string | null> {
  return present((base) => ({ kind: 'choice', ...config, ...base }))
}

/** Show a single-line text-input dialog; resolves with the text or null if cancelled. */
export function showPromptDialog(config: PromptDialog): Promise<string | null> {
  return present((base) => ({ kind: 'prompt', ...config, ...base }))
}

/** Show a yes/no confirmation; resolves true if confirmed, false if cancelled. */
export function showConfirmDialog(config: ConfirmDialog): Promise<boolean> {
  return present((base) => ({ kind: 'confirm', ...config, ...base })).then((v) => v !== null)
}
