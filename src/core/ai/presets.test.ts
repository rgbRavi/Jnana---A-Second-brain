// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'

const invokeMock = vi.fn()
vi.mock('../ipc', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }))

import { eventBus } from '../../lib/eventBus'
import { defaultConfig, loadAiConfig } from './config'
import {
  activePreset,
  applyAiPreset,
  deleteAiPreset,
  isModified,
  renameAiPreset,
  saveAiPreset,
  sectionFields,
  updateAiPreset,
} from './presets'
import type { AiConfig } from '../../types'

function withPreset(): AiConfig {
  const c = defaultConfig()
  c.chatProvider = 'openai'
  c.chatBaseUrl = 'https://x/v1'
  c.chatModel = 'm1'
  c.chatSystemPrompt = 'be brief'
  c.presets.chat = [
    { id: 'p1', name: 'P', provider: 'openai', baseUrl: 'https://x/v1', model: 'm1', systemPrompt: 'be brief', hasApiKey: true },
  ]
  c.activePresets = { chat: 'p1' }
  return c
}

describe('isModified', () => {
  it('is false right after apply', () => {
    expect(isModified(withPreset(), 'chat')).toBe(false)
    expect(activePreset(withPreset(), 'chat')?.id).toBe('p1')
    expect(sectionFields(withPreset(), 'chat').model).toBe('m1')
  })
  it('is true when model differs', () => {
    const c = withPreset()
    c.chatModel = 'm2'
    expect(isModified(c, 'chat')).toBe(true)
  })
  it('is true when chat system prompt differs', () => {
    const c = withPreset()
    c.chatSystemPrompt = 'other'
    expect(isModified(c, 'chat')).toBe(true)
  })
  it('is true when a new key was typed', () => {
    const c = withPreset()
    c.chatApiKey = 'sk-new'
    expect(isModified(c, 'chat')).toBe(true)
  })
  it('is true when the live section has a key the preset lacks', () => {
    const c = withPreset()
    c.presets.chat[0].hasApiKey = false
    c.hasChatApiKey = true
    expect(isModified(c, 'chat')).toBe(true)
  })
  it('is false with no active preset', () => {
    const c = withPreset()
    c.activePresets = {}
    c.chatModel = 'm2'
    expect(isModified(c, 'chat')).toBe(false)
  })
})

describe('wrappers', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue({ chatBaseUrl: 'u', chatModel: 'zz' })
  })
  const cases: [string, () => Promise<void>, Record<string, string>][] = [
    ['save_ai_preset', () => saveAiPreset('chat', 'N'), { section: 'chat', name: 'N' }],
    ['update_ai_preset', () => updateAiPreset('chat', 'i'), { section: 'chat', id: 'i' }],
    ['apply_ai_preset', () => applyAiPreset('chat', 'i'), { section: 'chat', id: 'i' }],
    ['rename_ai_preset', () => renameAiPreset('chat', 'i', 'N'), { section: 'chat', id: 'i', name: 'N' }],
    ['delete_ai_preset', () => deleteAiPreset('chat', 'i'), { section: 'chat', id: 'i' }],
  ]
  for (const [cmd, run, args] of cases) {
    it(`${cmd} invokes and emits ai:configChanged with the new config`, async () => {
      const spy = vi.spyOn(eventBus, 'emit')
      await run()
      expect(invokeMock).toHaveBeenCalledWith(cmd, args)
      const call = spy.mock.calls.find((c) => c[0] === 'ai:configChanged')
      expect((call?.[1] as { config: AiConfig }).config.chatModel).toBe('zz')
      spy.mockRestore()
    })
  }
  it('propagates errors without emitting', async () => {
    invokeMock.mockRejectedValue(new Error('boom'))
    const spy = vi.spyOn(eventBus, 'emit')
    await expect(applyAiPreset('chat', 'i')).rejects.toThrow('boom')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('loadAiConfig', () => {
  it('fills missing preset/prompt fields with empties', async () => {
    invokeMock.mockResolvedValue({ chatBaseUrl: 'u', embeddingBaseUrl: 'e' })
    const c = await loadAiConfig()
    expect(c.chatSystemPrompt).toBe('')
    expect(c.globalSystemPrompt).toBe('')
    expect(c.activePresets).toEqual({})
    expect(c.presets.chat).toEqual([])
    expect(c.presets.webSearch).toEqual([])
  })
})

describe('fresh-install guard', () => {
  it('keeps presets/prompts when base URLs are empty and fills default URLs/models', async () => {
    invokeMock.mockResolvedValue({
      chatBaseUrl: '',
      embeddingBaseUrl: '',
      chatModel: '',
      chatSystemPrompt: 'hi',
      presets: { chat: [{ id: 'p', name: 'P', provider: 'ollama', baseUrl: '', model: '', systemPrompt: '', hasApiKey: false }] },
    })
    const c = await loadAiConfig()
    expect(c.chatSystemPrompt).toBe('hi')
    expect(c.presets.chat).toHaveLength(1)
    expect(c.chatBaseUrl).toBe(defaultConfig().chatBaseUrl)
    expect(c.chatModel).toBe(defaultConfig().chatModel)
    expect(c.embeddingBaseUrl).toBe(defaultConfig().embeddingBaseUrl)
  })
  it('preset command on fresh install does not blank defaults', async () => {
    invokeMock.mockResolvedValue({ chatBaseUrl: '', embeddingBaseUrl: '', globalSystemPrompt: 'g' })
    const spy = vi.spyOn(eventBus, 'emit')
    await saveAiPreset('chat', 'N')
    const cfg = (spy.mock.calls.find((c) => c[0] === 'ai:configChanged')![1] as { config: AiConfig }).config
    expect(cfg.chatBaseUrl).toBe(defaultConfig().chatBaseUrl)
    spy.mockRestore()
  })
  it('still returns defaults for a truly fresh config', async () => {
    invokeMock.mockResolvedValue({ chatBaseUrl: '', embeddingBaseUrl: '' })
    expect(await loadAiConfig()).toEqual(defaultConfig())
  })
})

describe('fresh-config fill follows the stored provider', () => {
  const preset = { chat: [{ id: 'p', name: 'P', provider: 'openai', baseUrl: '', model: '', systemPrompt: '', hasApiKey: false }] }
  it('openai chat gets openai url/model; local transcription gets local default', async () => {
    invokeMock.mockResolvedValue({
      chatBaseUrl: '', embeddingBaseUrl: '', chatProvider: 'openai', embeddingProvider: 'openai',
      transcriptionProvider: 'local', deepResearchProvider: 'ollama', presets: preset,
    })
    const c = await loadAiConfig()
    expect(c.chatBaseUrl).toBe('https://api.openai.com/v1')
    expect(c.chatModel).toBe('gpt-4o-mini')
    expect(c.embeddingBaseUrl).toBe('https://api.openai.com/v1')
    expect(c.embeddingModel).toBe('text-embedding-3-small')
    expect(c.transcriptionBaseUrl).toBe('http://localhost:8000/v1')
    expect(c.transcriptionModel).toBe('Systran/faster-whisper-small')
    expect(c.deepResearchBaseUrl).toBe('http://localhost:11434')
    expect(c.deepResearchModel).toBe('')
  })
  it('never overwrites non-empty values', async () => {
    invokeMock.mockResolvedValue({
      chatBaseUrl: '', embeddingBaseUrl: 'http://mine', embeddingModel: 'mine-m',
      transcriptionBaseUrl: 'http://t', transcriptionModel: 'tm', presets: preset,
    })
    const c = await loadAiConfig()
    expect(c.embeddingBaseUrl).toBe('http://mine')
    expect(c.embeddingModel).toBe('mine-m')
    expect(c.transcriptionBaseUrl).toBe('http://t')
    expect(c.transcriptionModel).toBe('tm')
  })
})
