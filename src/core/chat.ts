// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/chat.ts
// Thin wrappers over the Rust conversation-history commands.
import { invoke } from '@tauri-apps/api/core'
import type { ConversationMeta, StoredConversation } from '../types'

export async function listConversations(
  mode?: string,
  vaultId?: string | null,
): Promise<ConversationMeta[]> {
  return invoke<ConversationMeta[]>('list_conversations', { mode: mode ?? null, vaultId: vaultId ?? null })
}

export async function getConversation(id: string): Promise<StoredConversation> {
  // Rust's `rule_ids` (→ camelCase `ruleIds`) is a JSON string column; the
  // frontend-facing StoredConversation.ruleIds is the parsed array.
  const row = await invoke<Omit<StoredConversation, 'ruleIds'> & { ruleIds?: string | null }>('get_conversation', { id })
  return { ...row, ruleIds: row.ruleIds ? (JSON.parse(row.ruleIds) as string[]) : [] }
}

export async function saveConversation(conversation: StoredConversation): Promise<void> {
  const { ruleIds, ...rest } = conversation
  await invoke('save_conversation', { conversation: { ...rest, ruleIds: JSON.stringify(ruleIds ?? []) } })
}

export async function deleteConversation(id: string): Promise<void> {
  await invoke('delete_conversation', { id })
}

export async function renameConversation(id: string, title: string, updatedAt: number): Promise<void> {
  await invoke('rename_conversation', { id, title, updatedAt })
}
