// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Persisted store for Advanced AI generation settings (rule refresh/selection
// strategy knobs). localStorage module-store pattern — see useComposerOptions.
import { useSyncExternalStore } from 'react'
import { DEFAULT_ADVANCED_AI, type AdvancedAiSettings } from '../core/ai/ruleEngine'

const KEY = 'jnana.advancedAi.v1'

function load(): AdvancedAiSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_ADVANCED_AI, ...(JSON.parse(raw) as Partial<AdvancedAiSettings>) } : DEFAULT_ADVANCED_AI
  } catch {
    return DEFAULT_ADVANCED_AI
  }
}

let state: AdvancedAiSettings = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
}

export function setAdvancedAiSettings(patch: Partial<AdvancedAiSettings>): void {
  state = { ...state, ...patch }
  persist()
  listeners.forEach((l) => l())
}

/** Non-reactive read (for one-time state seeding). */
export function getAdvancedAiSettings(): AdvancedAiSettings {
  return state
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => state

export function useAdvancedAiSettings(): AdvancedAiSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
