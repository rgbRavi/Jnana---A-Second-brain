// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'

const invokeMock = vi.fn()
vi.mock('../ipc', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }))

import { testAiConnection, describeConnectionFailure } from './testConnection'

beforeEach(() => invokeMock.mockReset())

describe('testAiConnection', () => {
  it('succeeds on 2xx', async () => {
    invokeMock.mockResolvedValue({ status: 200, body: '{}' })
    expect((await testAiConnection('chat', 'openai', 'gpt')).ok).toBe(true)
    expect(invokeMock.mock.calls[0][1].path).toBe('/chat/completions')
  })
  it('maps statuses and transport errors to plain language', async () => {
    invokeMock.mockResolvedValue({ status: 401, body: 'x' })
    expect((await testAiConnection('chat', 'openai', 'm')).message).toMatch(/API key/)
  })
  it('maps a transport failure to plain language', async () => {
    invokeMock.mockRejectedValueOnce(new Error('AI request failed: error sending request'))
    expect((await testAiConnection('embedding', 'ollama', 'm')).message).toMatch(/reach Ollama/)
    expect(describeConnectionFailure(404)).toMatch(/model/)
  })
  it('needs a model', async () => {
    expect((await testAiConnection('chat', 'ollama', ' ')).ok).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
  })
  it('gives Ollama-specific next steps', async () => {
    invokeMock.mockResolvedValue({ status: 404, body: '' })
    expect((await testAiConnection('chat', 'ollama', 'llama3.2')).message).toBe(
      'Ollama is running but doesn’t have “llama3.2” yet. Run: ollama pull llama3.2'.replace('’', "'"),
    )
    invokeMock.mockResolvedValue({ status: 404, body: '' })
    expect((await testAiConnection('chat', 'openai', 'gpt')).message).toMatch(/doesn't know that model/)
  })
})
