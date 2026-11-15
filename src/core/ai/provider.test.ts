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

import { getChatProvider, streamChat } from './provider'
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

describe('streamChat', () => {
  it('a request stopped before it starts never reaches Rust and resolves empty', async () => {
    invokeMock.mockReset().mockResolvedValue(undefined)
    const ctrl = new AbortController()
    ctrl.abort()
    const onToken = vi.fn()
    const config = { chatProvider: 'openai', chatModel: 'm' } as AiConfig
    await expect(streamChat(config, [{ role: 'user', content: 'hi' }], { signal: ctrl.signal }, onToken)).resolves.toBe('')
    expect(invokeMock).not.toHaveBeenCalled()
    expect(onToken).not.toHaveBeenCalled()
  })

  const run = async (provider: 'openai' | 'ollama', lines: string[]) => {
    invokeMock.mockReset().mockImplementation((_cmd: string, args: { onEvent: { onmessage: (m: Msg) => void } }) => {
      for (const l of lines) args.onEvent.onmessage({ type: 'chunk', text: l })
      args.onEvent.onmessage({ type: 'done' })
      return Promise.resolve()
    })
    const onToken = vi.fn()
    const onReasoning = vi.fn()
    const config = { chatProvider: provider, chatModel: 'm' } as AiConfig
    const out = await streamChat(config, [{ role: 'user', content: 'hi' }], { onReasoning }, onToken)
    return { out, tokens: onToken.mock.calls.map((c) => c[0]).join(''), thoughts: onReasoning.mock.calls.map((c) => c[0]).join('') }
  }
  const delta = (d: Record<string, string>) => `data: ${JSON.stringify({ choices: [{ delta: d }] })}\n`

  it('routes DeepSeek-style reasoning_content to onReasoning, never into the reply', async () => {
    const r = await run('openai', [delta({ reasoning_content: 'Let me think. ' }), delta({ reasoning_content: 'Done.' }), delta({ content: 'Answer' })])
    expect(r.thoughts).toBe('Let me think. Done.')
    expect(r.tokens).toBe('Answer')
    expect(r.out).toBe('Answer')
  })

  it('reads OpenRouter-style delta.reasoning', async () => {
    const r = await run('openai', [delta({ reasoning: 'hmm' }), delta({ content: 'ok' })])
    expect(r.thoughts).toBe('hmm')
    expect(r.out).toBe('ok')
  })

  it('reads Ollama message.thinking', async () => {
    const r = await run('ollama', [
      JSON.stringify({ message: { thinking: 'pondering', content: '' } }) + '\n',
      JSON.stringify({ message: { content: 'reply' } }) + '\n',
    ])
    expect(r.thoughts).toBe('pondering')
    expect(r.out).toBe('reply')
  })
})
