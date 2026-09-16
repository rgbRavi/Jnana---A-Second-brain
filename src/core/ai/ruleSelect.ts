// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// rag-topK rule selection (Phase 2). Embeds the query + each enabled rule,
// keeps all critical rules, fills the rest by cosine similarity. Falls back to
// the pure `selectRules` (all-enabled) on any embedding failure — selection must
// never drop a rule or break a send. Rule embeddings are cached by text.
import type { AiRule, AiConfig } from '../../types'
import { selectRules, type AdvancedAiSettings } from './ruleEngine'
import { getEmbeddingProvider } from './provider'

export function cosineSim(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0,
    na = 0,
    nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function topKByScore(rules: AiRule[], scores: number[], k: number): AiRule[] {
  const critical = rules.filter((r) => r.critical)
  const rest = rules
    .map((r, i) => ({ r, s: scores[i] ?? 0 }))
    .filter((x) => !x.r.critical)
    .sort((x, y) => y.s - x.s)
  const slots = Math.max(0, k - critical.length)
  const picked = rest.slice(0, slots).map((x) => x.r)
  // Preserve original order for stable prompts.
  const keep = new Set([...critical, ...picked].map((r) => r.id))
  return rules.filter((r) => keep.has(r.id))
}

const embedCache = new Map<string, number[]>()

export async function selectRulesForSend(
  effective: AiRule[],
  cfg: AdvancedAiSettings,
  query: string,
  config: AiConfig,
): Promise<AiRule[]> {
  if (cfg.selection !== 'rag-topK' || effective.length <= cfg.ragTopK) {
    return selectRules(effective, cfg) // all-enabled path (pure) or nothing to prune
  }
  try {
    const provider = getEmbeddingProvider(config)
    const missing = effective.filter((r) => !embedCache.has(r.text))
    if (missing.length) {
      const vecs = await provider.embed(missing.map((r) => r.text))
      missing.forEach((r, i) => embedCache.set(r.text, vecs[i] ?? []))
    }
    const [qv] = await provider.embed([query])
    if (!qv) return selectRules(effective, cfg)
    const scores = effective.map((r) => cosineSim(qv, embedCache.get(r.text) ?? []))
    return topKByScore(effective, scores, cfg.ragTopK)
  } catch {
    return selectRules(effective, cfg) // degrade to all-enabled
  }
}
