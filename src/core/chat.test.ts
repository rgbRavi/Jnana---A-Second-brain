// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('./ipc', () => ({ invoke: (...a: unknown[]) => mockInvoke(...a) }))

import { getConversation, saveConversation } from './chat'
import type { StoredConversation } from '../types'

beforeEach(() => mockInvoke.mockReset())

describe('chat conversation systemPrompt', () => {
  it('passes systemPrompt to save_conversation', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await saveConversation({ id: 'c', systemPrompt: 'hi', ruleIds: [] } as unknown as StoredConversation)
    expect(mockInvoke.mock.calls[0][1].conversation.systemPrompt).toBe('hi')
  })
  it('reads it back from get_conversation', async () => {
    mockInvoke.mockResolvedValue({ id: 'c', ruleIds: null, systemPrompt: 'hi' })
    expect((await getConversation('c')).systemPrompt).toBe('hi')
  })
})
