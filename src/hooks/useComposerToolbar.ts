// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Which controls the chat composer toolbar shows, and in what order. Module store +
// localStorage + useSyncExternalStore (same pattern as useComposerOptions).

import { useSyncExternalStore } from 'react'

export type ToolbarItem = 'preset' | 'attach' | 'capabilities' | 'more' | 'focused'
export const DEFAULT_TOOLBAR: ToolbarItem[] = ['preset', 'attach', 'capabilities', 'more', 'focused']
export const DEFAULT_HIDDEN: ToolbarItem[] = ['preset']

export interface ToolbarState {
  order: ToolbarItem[]
  hidden: ToolbarItem[]
}

const STORAGE_KEY = 'jnana.ai.composerToolbar.v1'
const isItem = (x: unknown): x is ToolbarItem => DEFAULT_TOOLBAR.includes(x as ToolbarItem)
const uniq = (xs: unknown): ToolbarItem[] => (Array.isArray(xs) ? [...new Set(xs.filter(isItem))] : [])

/** Drops unknown ids and duplicates; appends any missing defaults at the end. */
export function sanitizeToolbar(raw: unknown): ToolbarState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { order?: unknown; hidden?: unknown }
  const order = uniq(r.order)
  for (const d of DEFAULT_TOOLBAR) if (!order.includes(d)) order.push(d)
  // No saved choice yet → the preset pill starts hidden (opt in from Settings → How the AI answers → Chat toolbar).
  return { order, hidden: Array.isArray(r.hidden) ? uniq(r.hidden) : [...DEFAULT_HIDDEN] }
}

function load(): ToolbarState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return sanitizeToolbar(raw ? JSON.parse(raw) : null)
  } catch {
    return sanitizeToolbar(null)
  }
}

let state: ToolbarState = load()
const listeners = new Set<() => void>()

function set(next: ToolbarState) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
  listeners.forEach((l) => l())
}

const actions = {
  move(from: number, to: number) {
    const order = [...state.order]
    if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return
    order.splice(to, 0, order.splice(from, 1)[0])
    set({ ...state, order })
  },
  toggle(item: ToolbarItem) {
    set({
      ...state,
      hidden: state.hidden.includes(item) ? state.hidden.filter((i) => i !== item) : [...state.hidden, item],
    })
  },
  reset() {
    set(sanitizeToolbar(null))
  },
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const getSnapshot = () => state

export function useComposerToolbar(): [ToolbarState, typeof actions] {
  return [useSyncExternalStore(subscribe, getSnapshot, getSnapshot), actions]
}
