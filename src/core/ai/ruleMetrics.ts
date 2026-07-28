// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Local A/B signal: a capped ring buffer of per-turn rule-injection events, so a
// solo dev + beta testers can compare refresh/selection strategies. Pattern
// mirrors quizMemory.ts. No dashboard — the Advanced panel offers a JSON export.
import type { RefreshStrategy, SelectionStrategy } from './ruleEngine'

export interface RuleEvent {
  ts: number
  convId: string
  strategy: RefreshStrategy
  selection: SelectionStrategy
  ruleCount: number
  refreshFired: boolean
  approxTokensAdded: number
}

const KEY = 'jnana.ruleMetrics.v1'
const CAP = 200

export function getRuleEvents(): RuleEvent[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as RuleEvent[]) : []
  } catch {
    return []
  }
}

export function recordRuleEvent(e: RuleEvent): void {
  const next = [...getRuleEvents(), e].slice(-CAP)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage full — metrics are best-effort */
  }
}

export function clearRuleEvents(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
