// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// counters-drift refresh signal (Phase 2, experimental). Two modes:
//  - topic-shift: refresh when the latest user turn has moved away (low cosine)
//    from the turn where rules were last injected — a new subtask, reassert rules.
//  - rule-content: the spec-literal signal — refresh when the latest turn is far
//    from the rules' own embeddings (noisy for behavioural rules; kept for A/B).
// On any embedding failure returns false so counters alone decides. Never throws.
import type { AiRule, AiConfig } from '../../types'
import type { AdvancedAiSettings, DriftMode } from './ruleEngine'
import { getEmbeddingProvider } from './provider'
import { cosineSim } from './ruleSelect'

export function isDrift(mode: DriftMode, simToAnchor: number, simToRules: number, threshold: number): boolean {
  const sim = mode === 'topic-shift' ? simToAnchor : simToRules
  return sim < threshold
}

export interface DriftContext {
  latestUserText: string
  anchorText: string
  rules: AiRule[]
}

export async function driftSignal(
  cfg: AdvancedAiSettings,
  config: AiConfig,
  ctx: DriftContext,
): Promise<boolean> {
  if (!ctx.latestUserText.trim()) return false
  try {
    const provider = getEmbeddingProvider(config)
    const [qv] = await provider.embed([ctx.latestUserText])
    if (!qv) return false
    let simToAnchor = 1, simToRules = 1
    if (cfg.driftMode === 'topic-shift') {
      if (!ctx.anchorText.trim()) return false // no anchor yet (first injection) → let counters decide
      const [av] = await provider.embed([ctx.anchorText])
      simToAnchor = av ? cosineSim(qv, av) : 1
    } else {
      const ruleText = ctx.rules.map((r) => r.text).join('\n')
      if (!ruleText.trim()) return false
      const [rv] = await provider.embed([ruleText])
      simToRules = rv ? cosineSim(qv, rv) : 1
    }
    return isDrift(cfg.driftMode, simToAnchor, simToRules, cfg.driftThreshold)
  } catch {
    return false
  }
}
