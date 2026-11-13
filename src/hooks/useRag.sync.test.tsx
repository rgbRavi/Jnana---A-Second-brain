// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const invokeMock = vi.fn()
vi.mock('../core/ipc', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }))
vi.mock('../core/ai/provider', async (orig) => ({ ...(await orig<object>()) }))
const indexNotesMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../core/ai', async (orig) => ({ ...(await orig<object>()), indexNotes: (...a: unknown[]) => indexNotesMock(...a) }))
vi.mock('./useVaults', () => ({ useActiveVaultId: () => 'v' }))

import { useRag } from './useRag'
import { eventBus } from '../lib/eventBus'
import { fromStoredConfig } from '../core/ai/config'

const stored = (model: string) => ({ chatBaseUrl: 'u', embeddingBaseUrl: 'e', chatModel: model })

beforeEach(() => {
  invokeMock.mockReset()
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === 'get_ai_config') return stored('loaded')
    if (cmd === 'get_index_stats') return { chunkCount: 0, indexedNoteCount: 0 }
    return undefined
  })
})

describe('useRag cross-instance sync', () => {
  it('updateConfig makes the other instance reload; own event ignored', async () => {
    const a = renderHook(() => useRag())
    const b = renderHook(() => useRag())
    await waitFor(() => expect(a.result.current.config.chatModel).toBe('loaded'))
    await waitFor(() => expect(b.result.current.config.chatModel).toBe('loaded'))
    const gets = () => invokeMock.mock.calls.filter((c) => c[0] === 'get_ai_config').length
    const before = gets()
    invokeMock.mockImplementation(async (cmd: string) => (cmd === 'get_ai_config' ? stored('fresh') : undefined))
    await act(async () => {
      a.result.current.updateConfig({ ...a.result.current.config, chatModel: 'draft' })
    })
    await waitFor(() => expect(b.result.current.config.chatModel).toBe('fresh'))
    expect(gets()).toBe(before + 1) // only B reloaded
    expect(a.result.current.config.chatModel).toBe('draft')
  })

  it('a {config} event updates both synchronously', async () => {
    const a = renderHook(() => useRag())
    const b = renderHook(() => useRag())
    await waitFor(() => expect(a.result.current.config.chatModel).toBe('loaded'))
    act(() => eventBus.emit('ai:configChanged', { config: fromStoredConfig(stored('preset')) }))
    expect(a.result.current.config.chatModel).toBe('preset')
    expect(b.result.current.config.chatModel).toBe('preset')
  })

  it('reindexAll called in the same tick as a {config} event uses the new config', async () => {
    const a = renderHook(() => useRag())
    await waitFor(() => expect(a.result.current.config.chatModel).toBe('loaded'))
    const staleReindex = a.result.current.reindexAll // closure from before the event
    await act(async () => {
      eventBus.emit('ai:configChanged', {
        config: { ...fromStoredConfig(stored('x')), enabled: true, embeddingModel: 'new-embed' },
      })
      await staleReindex([])
    })
    expect(indexNotesMock).toHaveBeenCalled()
    expect(indexNotesMock.mock.calls[0][1].embeddingModel).toBe('new-embed')
  })
})
