// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// User-authored Rules: short instructions re-injected to keep long chats on
// track. Backed by the Rust ai_rules table. Mirrors aiWorkspace.ts (presets).
import { invoke } from '@tauri-apps/api/core'
import type { AiRule } from '../types'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

export async function listRules(vaultId: string): Promise<AiRule[]> {
  return invoke<AiRule[]>('list_rules', { vaultId })
}
export async function saveRule(rule: AiRule): Promise<void> {
  await invoke('save_rule', { rule })
}
export async function deleteRule(id: string): Promise<void> {
  await invoke('delete_rule', { id })
}
export async function listProjectRules(projectId: string): Promise<string[]> {
  return invoke<string[]>('list_project_rules', { projectId })
}
export async function setProjectRules(projectId: string, ruleIds: string[]): Promise<void> {
  await invoke('set_project_rules', { projectId, ruleIds })
}

export function newRule(vaultId: string): AiRule {
  return { id: newId(), vaultId, name: '', text: '', critical: false, createdAt: Date.now() }
}

const DEFAULT_RULES: Array<Pick<AiRule, 'name' | 'text' | 'critical'>> = [
  { name: 'Ground in notes', text: 'Ground every claim in my actual notes; never invent note contents.', critical: true },
  { name: 'Be concise', text: 'Be concise; lead with the answer, then detail.', critical: false },
  { name: 'Preserve formatting', text: "Preserve my markdown, wikilinks, and formatting; don't rewrite them unasked.", critical: false },
]

/** Seed the built-in rules the first time a vault has none. */
export async function ensureDefaultRules(vaultId: string): Promise<AiRule[]> {
  const existing = await listRules(vaultId)
  if (existing.length > 0) return existing
  const now = Date.now()
  for (const d of DEFAULT_RULES) {
    await saveRule({ id: newId(), vaultId, name: d.name, text: d.text, critical: d.critical, createdAt: now })
  }
  return listRules(vaultId)
}

/** Effective rules for a turn = session-selected ∪ project-inherited, dedup by id. */
export function resolveEffectiveRules(sessionIds: string[], projectIds: string[], all: AiRule[]): AiRule[] {
  const want = new Set([...sessionIds, ...projectIds])
  return all.filter((rule) => want.has(rule.id))
}

/** Render the selected rules into a system-prompt block. '' when empty. */
export function buildRulesSystem(rules: AiRule[]): string {
  const lines = rules.map((rule) => `- ${rule.text.trim()}`).filter((l) => l !== '- ')
  if (lines.length === 0) return ''
  return `Active rules — you MUST follow these throughout the conversation:\n${lines.join('\n')}`
}
