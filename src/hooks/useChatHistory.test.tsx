// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../core/chat', () => ({
  getConversation: vi.fn(),
  saveConversation: vi.fn(),
}))

import { requestChatAction, useChatHistory } from './useChatHistory'

describe('requestChatAction', () => {
  it('queues an action while the chat is not mounted and runs it when it mounts', () => {
    const onNew = vi.fn()
    // Requested from Projects: no chat mounted yet, so an event would be lost.
    requestChatAction('chat-test-a', { type: 'new', projectId: 'p1' })
    expect(onNew).not.toHaveBeenCalled()

    renderHook(() => useChatHistory('chat-test-a', vi.fn(), onNew))
    expect(onNew).toHaveBeenCalledWith({ projectId: 'p1' })
  })

  it('runs immediately when the chat is already mounted, and only once', () => {
    const onNew = vi.fn()
    const { unmount } = renderHook(() => useChatHistory('chat-test-b', vi.fn(), onNew))
    onNew.mockClear()

    requestChatAction('chat-test-b', { type: 'new' })
    expect(onNew).toHaveBeenCalledTimes(1)

    // After unmount it queues again rather than firing into the void.
    unmount()
    requestChatAction('chat-test-b', { type: 'new' })
    expect(onNew).toHaveBeenCalledTimes(1)
  })
})
