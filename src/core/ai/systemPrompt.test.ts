// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { composeUserSystemPrompt } from './systemPrompt'

describe('composeUserSystemPrompt', () => {
  const cases: Array<[string | undefined, string | undefined, string | undefined, string]> = [
    [undefined, undefined, undefined, ''],
    ['C', undefined, undefined, 'C'],
    [undefined, 'G', undefined, 'G'],
    ['C', 'G', undefined, 'C'],
    [undefined, undefined, 'V', 'V'],
    ['C', undefined, 'V', 'C\n\nV'],
    [undefined, 'G', 'V', 'G\n\nV'],
    ['C', 'G', 'V', 'C\n\nV'],
  ]
  it.each(cases)('chat=%s global=%s conversation=%s', (chat, global, conversation, out) => {
    expect(composeUserSystemPrompt({ chat, global, conversation })).toBe(out)
  })

  it('treats whitespace-only as absent and trims', () => {
    expect(composeUserSystemPrompt({ chat: '  ', global: ' G ', conversation: '\n' })).toBe('G')
  })
})
