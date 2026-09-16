// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure strategy layer for adaptive rule injection. `shouldRefresh` decides WHEN
// to re-inject rules near the conversation tail; `selectRules` decides WHICH.
// Phase-2 strategies (drift/violation/rag) are declared but fall back to the
// Phase-1 behaviour until built — each is one added branch here, no rework.
import type { AiRule } from '../../types'

export type RefreshStrategy = 'off' | 'always-tail' | 'counters' | 'counters-drift' | 'counters-violation'
export type SelectionStrategy = 'all-enabled' | 'rag-topK'
export type DriftMode = 'topic-shift' | 'rule-content'

export interface AdvancedAiSettings {
  refreshStrategy: RefreshStrategy
  everyNTurns: number
  tokenThreshold: number
  selection: SelectionStrategy
  ragTopK: number
  logMetrics: boolean
  driftMode: DriftMode
  driftThreshold: number
  violationEveryNTurns: number
  violationModel: string
}

export const DEFAULT_ADVANCED_AI: AdvancedAiSettings = {
  refreshStrategy: 'counters',
  everyNTurns: 4,
  tokenThreshold: 3000,
  selection: 'all-enabled',
  ragTopK: 5,
  logMetrics: true,
  driftMode: 'topic-shift',
  driftThreshold: 0.6,
  violationEveryNTurns: 3,
  violationModel: '',
}

export interface RefreshState {
  /** Number of user turns so far (1-based for the turn being sent). */
  turnIndex: number
  /** Cheap token estimate of the history being sent. */
  approxTokens: number
  /** turnIndex at which rules were last tail-injected (0 = never). */
  lastInjectedTurn: number
}

/** No tokenizer dependency — ~4 chars/token is close enough for thresholds. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function shouldRefresh(state: RefreshState, cfg: AdvancedAiSettings): boolean {
  switch (cfg.refreshStrategy) {
    case 'off':
      return false
    case 'always-tail':
      return true
    // Phase 2 detectors not built yet → behave as counters.
    case 'counters':
    case 'counters-drift':
    case 'counters-violation':
      return (
        state.turnIndex - state.lastInjectedTurn >= cfg.everyNTurns ||
        state.approxTokens >= cfg.tokenThreshold
      )
  }
}

export function selectRules(effective: AiRule[], cfg: AdvancedAiSettings): AiRule[] {
  // rag-topK selection is Phase 2; until then it degrades to all-enabled.
  // Critical rules are always retained (the invariant Phase 2 must preserve).
  if (cfg.selection === 'rag-topK') {
    return effective // ponytail: phase-2 seam — replace with critical ∪ topK(cosine)
  }
  return effective
}
