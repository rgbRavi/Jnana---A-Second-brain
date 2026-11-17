// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Persisted store for Advanced AI generation settings (rule refresh/selection
// strategy knobs). localStorage module-store pattern — see useComposerOptions.
import { useSyncExternalStore } from 'react'
import { DEFAULT_ADVANCED_AI, type AdvancedAiSettings } from '../core/ai/ruleEngine'

const KEY = 'jnana.advancedAi.v1'

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

/** Stored JSON is untrusted: clamp numbers, drop unknown enum values, ignore wrong types. */
export function sanitizeAdvancedAi(raw: unknown): AdvancedAiSettings {
  const d = DEFAULT_ADVANCED_AI
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    refreshStrategy: oneOf(r.refreshStrategy, ['off', 'always-tail', 'counters', 'counters-drift', 'counters-violation'], d.refreshStrategy),
    everyNTurns: Math.round(num(r.everyNTurns, 1, 20, d.everyNTurns)),
    tokenThreshold: Math.round(num(r.tokenThreshold, 500, 20_000, d.tokenThreshold)),
    selection: oneOf(r.selection, ['all-enabled', 'rag-topK'], d.selection),
    ragTopK: Math.round(num(r.ragTopK, 1, 20, d.ragTopK)),
    logMetrics: typeof r.logMetrics === 'boolean' ? r.logMetrics : d.logMetrics,
    driftMode: oneOf(r.driftMode, ['topic-shift', 'rule-content'], d.driftMode),
    driftThreshold: num(r.driftThreshold, 0.1, 0.95, d.driftThreshold),
    violationEveryNTurns: Math.round(num(r.violationEveryNTurns, 1, 10, d.violationEveryNTurns)),
    violationModel: typeof r.violationModel === 'string' ? r.violationModel.slice(0, 200) : d.violationModel,
    noteContextTokens: Math.round(num(r.noteContextTokens, 1000, 2_000_000, d.noteContextTokens)),
    webCitations: oneOf(r.webCitations, ['checked', 'sources'], d.webCitations),
  }
}

function load(): AdvancedAiSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? sanitizeAdvancedAi(JSON.parse(raw)) : DEFAULT_ADVANCED_AI
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
