// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('./useVaults', () => ({ useActiveVaultId: () => 'v' }))
vi.mock('../core/ai', async (orig) => ({
  ...(await orig<typeof import('../core/ai')>()),
  loadAiConfig: vi.fn().mockResolvedValue({}),
  saveAiConfig: vi.fn().mockResolvedValue(undefined),
  getIndexStats: vi.fn().mockResolvedValue({ chunkCount: 0, indexedNoteCount: 0 }),
}))

import { useRag } from './useRag'
import { defaultConfig, loadAiConfig } from '../core/ai'

describe('useRag key handling', () => {
  it('blanks typed keys once the save resolves but keeps the saved flag', async () => {
    const { result } = renderHook(() => useRag())
    await act(async () => {
      await result.current.updateConfig({ ...defaultConfig(), chatApiKey: 'sk-secret' })
    })
    await waitFor(() => expect(result.current.config.chatApiKey).toBe(''))
    expect(result.current.config.hasChatApiKey).toBe(true)
  })

  it('ignores the initial load if the user already edited', async () => {
    let resolve!: (c: ReturnType<typeof defaultConfig>) => void
    vi.mocked(loadAiConfig).mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const { result } = renderHook(() => useRag())
    await act(async () => {
      await result.current.updateConfig({ ...defaultConfig(), chatModel: 'edited' })
    })
    await act(async () => resolve({ ...defaultConfig(), chatModel: 'stale' }))
    expect(result.current.config.chatModel).toBe('edited')
  })
})
