// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Per-model capability answers from the user. Vision ("Send images to this model")
// and reasoning ("Reasoning model") are otherwise guessed from the model's name
// (core/ai/capabilities.ts), which misses new and aliased models — the user's
// explicit answer wins. localStorage module stores, keyed by the lower-cased model id.

const keyOf = (model: string) => (model || '').trim().toLowerCase()

function createModelOverride(storageKey: string) {
  const load = (): Record<string, boolean> => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    } catch {
      return {}
    }
  }
  let overrides: Record<string, boolean> = load()
  const listeners = new Set<() => void>()

  return {
    /** The user's answer for `model`, or undefined when they haven't given one. */
    get: (model: string): boolean | undefined => overrides[keyOf(model)],
    /** Record (or with `undefined`, clear) the user's answer for `model`. */
    set: (model: string, on: boolean | undefined): void => {
      const key = keyOf(model)
      if (!key) return
      const next = { ...overrides }
      if (on === undefined) delete next[key]
      else next[key] = on
      overrides = next
      try {
        localStorage.setItem(storageKey, JSON.stringify(overrides))
      } catch {
        /* storage unavailable — keep the in-memory value */
      }
      listeners.forEach((l) => l())
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Snapshot for useSyncExternalStore (a new object on every change). */
    snapshot: () => overrides,
  }
}

const vision = createModelOverride('jnana.ai.visionOverride.v1')
const thinking = createModelOverride('jnana.ai.thinkingOverride.v1')

export const getVisionOverride = vision.get
export const setVisionOverride = vision.set
export const subscribeVisionOverrides = vision.subscribe
export const getVisionOverrides = vision.snapshot

export const getThinkingOverride = thinking.get
export const setThinkingOverride = thinking.set
export const subscribeThinkingOverrides = thinking.subscribe
export const getThinkingOverrides = thinking.snapshot
