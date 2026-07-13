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
  return invoke<StoredConversation>('get_conversation', { id })
}

export async function saveConversation(conversation: StoredConversation): Promise<void> {
  await invoke('save_conversation', { conversation })
}

export async function deleteConversation(id: string): Promise<void> {
  await invoke('delete_conversation', { id })
}

export async function renameConversation(id: string, title: string, updatedAt: number): Promise<void> {
  await invoke('rename_conversation', { id, title, updatedAt })
}
