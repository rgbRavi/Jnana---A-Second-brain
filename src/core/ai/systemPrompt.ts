// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

/** The user's system prompt: the chat-specific one overrides the global one;
 *  the per-conversation prompt is appended. Empty when none is set. */
export function composeUserSystemPrompt(p: { chat?: string; global?: string; conversation?: string }): string {
  const base = p.chat?.trim() || p.global?.trim() || ''
  return [base, p.conversation?.trim() ?? ''].filter(Boolean).join('\n\n')
}
