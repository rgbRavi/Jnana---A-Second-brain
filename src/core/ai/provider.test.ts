// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  Channel: class {
    onmessage: (msg: unknown) => void = () => {}
  },
}))

import { getChatProvider } from './provider'
import type { AiConfig } from '../../types'

type Msg = { type: 'chunk'; text: string } | { type: 'done' }
const sse = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`

describe('ChatProvider.complete', () => {
  it('streams through ai_chat_stream (a silent non-streaming request gets killed by gateways)', async () => {
    invokeMock.mockReset().mockImplementation((_cmd: string, args: { onEvent: { onmessage: (m: Msg) => void } }) => {
      const emit = args.onEvent.onmessage
      emit({ type: 'chunk', text: sse('[{"q"') })
      emit({ type: 'chunk', text: sse(':1}]') + 'data: [DONE]\n' })
      emit({ type: 'done' })
      return Promise.resolve()
    })

    const config = { chatProvider: 'openai', chatModel: 'm' } as AiConfig
    const out = await getChatProvider(config).complete('prompt', { system: 'sys', temperature: 0.7 })

    expect(out).toBe('[{"q":1}]')
    const [cmd, args] = invokeMock.mock.calls[0] as [string, { target: string; path: string; body: string }]
    expect(cmd).toBe('ai_chat_stream')
    expect(args.target).toBe('chat')
    expect(args.path).toBe('/chat/completions')
    const body = JSON.parse(args.body)
    expect(body.stream).toBe(true)
    expect(body.temperature).toBe(0.7)
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'prompt' },
    ])
  })
})
