// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// counters-violation refresh (Phase 2, experimental). A cheap LLM-judge checks
// whether the recent exchange broke any active rule; if so, rules are re-injected.
// Gated to every Nth turn (judgeDue) to bound cost, and run on a configurable
// model (cfg.violationModel, blank = the chat model). Reuses the provider-aware
// non-streaming `chatWithTools(cfg, msgs, [])`. Any error → false (no refresh).
import type { AiRule, AiConfig } from '../../types'
import type { AdvancedAiSettings } from './ruleEngine'
import { chatWithTools, type AgentMessage } from './provider'

export function judgeDue(turnIndex: number, everyNTurns: number): boolean {
  if (everyNTurns <= 0) return false
  return turnIndex % everyNTurns === 0
}

export function parseViolation(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (/"?violated"?\s*:\s*true/.test(t)) return true
  if (/^\s*(yes|violation|violated)\b/.test(t)) return true
  if (/^\s*(no|none|no violation)\b/.test(t)) return false
  return false // unparseable → assume compliant, never a spurious refresh
}

export interface ViolationContext {
  turnIndex: number
  recentTurns: { role: 'user' | 'assistant'; content: string }[]
  rules: AiRule[]
}

export async function violationSignal(
  cfg: AdvancedAiSettings,
  config: AiConfig,
  ctx: ViolationContext,
): Promise<boolean> {
  if (!judgeDue(ctx.turnIndex, cfg.violationEveryNTurns) || ctx.rules.length === 0) return false
  try {
    const rulesText = ctx.rules.map((r, i) => `${i + 1}. ${r.text}`).join('\n')
    const transcript = ctx.recentTurns.slice(-4).map((m) => `${m.role}: ${m.content}`).join('\n')
    const messages: AgentMessage[] = [
      {
        role: 'system',
        content:
          'You are a strict compliance checker. Given a set of rules and a recent chat excerpt, answer with a single leading word: "YES" if the assistant broke any rule, otherwise "NO". Optionally add a short reason after.',
      },
      { role: 'user', content: `Rules:\n${rulesText}\n\nRecent exchange:\n${transcript}\n\nDid the assistant violate any rule?` },
    ]
    const judgeConfig: AiConfig = { ...config, chatModel: cfg.violationModel || config.chatModel }
    const { content } = await chatWithTools(judgeConfig, messages, [])
    return parseViolation(content ?? '')
  } catch {
    return false
  }
}
