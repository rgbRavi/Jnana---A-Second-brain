// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Async refresh decision layer (Phase 2). Delegates to the pure `shouldRefresh`
// for the cheap strategies (no IO) and adds the drift/violation signals for the
// experimental ones. Signals are injected (defaulting to the real async fns) so
// the routing stays unit-testable without embeddings/LLM calls.
import type { AiConfig, AiRule } from '../../types'
import { shouldRefresh, type AdvancedAiSettings, type RefreshState } from './ruleEngine'
import type { RefreshTrigger } from './ruleMetrics'
import { driftSignal } from './ruleDrift'
import { violationSignal } from './ruleJudge'

export interface DecideContext {
  latestUserText: string
  anchorText: string
  recentTurns: { role: 'user' | 'assistant'; content: string }[]
  rules: AiRule[]
}

interface Signals {
  drift: (cfg: AdvancedAiSettings, config: AiConfig, ctx: { latestUserText: string; anchorText: string; rules: AiRule[] }) => Promise<boolean>
  violation: (cfg: AdvancedAiSettings, config: AiConfig, ctx: { turnIndex: number; recentTurns: DecideContext['recentTurns']; rules: AiRule[] }) => Promise<boolean>
}

const REAL: Signals = { drift: driftSignal, violation: violationSignal }

export async function decideRefresh(
  state: RefreshState,
  cfg: AdvancedAiSettings,
  config: AiConfig,
  ctx: DecideContext,
  signals: Signals = REAL,
): Promise<{ refresh: boolean; trigger: RefreshTrigger }> {
  const counters = shouldRefresh(state, cfg)
  switch (cfg.refreshStrategy) {
    case 'off':
      return { refresh: false, trigger: 'none' }
    case 'always-tail':
      return { refresh: true, trigger: 'always' }
    case 'counters':
      return { refresh: counters, trigger: counters ? 'counters' : 'none' }
    case 'counters-drift': {
      if (counters) return { refresh: true, trigger: 'counters' }
      const drifted = await signals.drift(cfg, config, { latestUserText: ctx.latestUserText, anchorText: ctx.anchorText, rules: ctx.rules })
      return { refresh: drifted, trigger: drifted ? 'drift' : 'none' }
    }
    case 'counters-violation': {
      if (counters) return { refresh: true, trigger: 'counters' }
      const violated = await signals.violation(cfg, config, { turnIndex: state.turnIndex, recentTurns: ctx.recentTurns, rules: ctx.rules })
      return { refresh: violated, trigger: violated ? 'violation' : 'none' }
    }
  }
}
