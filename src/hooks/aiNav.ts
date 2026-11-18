// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { getViewState, setViewState, useViewState } from './useViewState'

/** The AI view's screens: the open conversation, the chats list, and projects. */
export type AiMode = 'chat' | 'chats' | 'projects'

const MODE = 'ai.mode'
const STACK = 'ai.mode.back'
const LABEL: Record<AiMode, string> = { chat: 'chat', chats: 'Chats', projects: 'Projects' }

/**
 * Switch AI screens, remembering where you came from so Back returns there.
 * Opening a conversation ('chat') is home and clears the trail. Going to a screen
 * already on the trail rewinds to it instead of stacking a loop
 * (chat → Chats → Projects → Chats leaves Back pointing at chat).
 */
export function goToAiMode(mode: AiMode): void {
  const cur = getViewState<AiMode>(MODE) ?? 'chat'
  if (cur === mode) return
  const stack = getViewState<AiMode[]>(STACK) ?? []
  const at = stack.indexOf(mode)
  setViewState<AiMode[]>(STACK, mode === 'chat' ? [] : at >= 0 ? stack.slice(0, at) : [...stack, cur])
  setViewState<AiMode>(MODE, mode)
}

/** Return to the screen this one was entered from (the conversation when there's no trail). */
export function backAiMode(): void {
  const stack = getViewState<AiMode[]>(STACK) ?? []
  setViewState<AiMode[]>(STACK, stack.slice(0, -1))
  setViewState<AiMode>(MODE, stack[stack.length - 1] ?? 'chat')
}

/** Label for the Back button, e.g. "Back to Chats". */
export function useAiBackLabel(): string {
  const [stack] = useViewState<AiMode[]>(STACK, [])
  return `Back to ${LABEL[stack[stack.length - 1] ?? 'chat']}`
}
