// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Per-model "this model accepts images" answer from the user (Attach menu →
// "Send images to this model"). Vision support is otherwise guessed from the
// model's name (core/ai/capabilities.ts), which misses new and aliased models —
// the user's explicit answer wins. localStorage module store, keyed by the
// lower-cased model id.

const KEY = 'jnana.ai.visionOverride.v1'

function load(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

let overrides: Record<string, boolean> = load()
const listeners = new Set<() => void>()
const keyOf = (model: string) => (model || '').trim().toLowerCase()

/** The user's answer for `model`, or undefined when they haven't given one. */
export function getVisionOverride(model: string): boolean | undefined {
  return overrides[keyOf(model)]
}

/** Record (or with `undefined`, clear) the user's answer for `model`. */
export function setVisionOverride(model: string, on: boolean | undefined): void {
  const key = keyOf(model)
  if (!key) return
  const next = { ...overrides }
  if (on === undefined) delete next[key]
  else next[key] = on
  overrides = next
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
  listeners.forEach((l) => l())
}

export function subscribeVisionOverrides(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Snapshot for useSyncExternalStore (a new object on every change). */
export const getVisionOverrides = () => overrides
