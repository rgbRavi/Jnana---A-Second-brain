// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeEach } from 'vitest'
import { goToAiMode, backAiMode } from './aiNav'
import { getViewState, setViewState } from './useViewState'

const mode = () => getViewState('ai.mode')

describe('AI view back trail', () => {
  beforeEach(() => { setViewState('ai.mode', 'chat'); setViewState('ai.mode.back', []) })

  it('Back returns to wherever the screen was entered from', () => {
    goToAiMode('projects')
    backAiMode()
    expect(mode()).toBe('chat')

    goToAiMode('chats')
    goToAiMode('projects')
    backAiMode()
    expect(mode()).toBe('chats')
    backAiMode()
    expect(mode()).toBe('chat')
  })

  it('revisiting a screen on the trail rewinds instead of looping', () => {
    goToAiMode('chats')
    goToAiMode('projects')
    goToAiMode('chats')
    backAiMode()
    expect(mode()).toBe('chat')
  })

  it('opening a conversation clears the trail', () => {
    goToAiMode('chats')
    goToAiMode('projects')
    goToAiMode('chat')
    goToAiMode('projects')
    backAiMode()
    expect(mode()).toBe('chat')
  })
})
