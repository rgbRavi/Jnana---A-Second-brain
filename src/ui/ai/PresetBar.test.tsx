// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { AiConfig } from '../../types'

const m = vi.hoisted(() => ({
  saveAiPreset: vi.fn().mockResolvedValue(undefined),
  updateAiPreset: vi.fn().mockResolvedValue(undefined),
  applyAiPreset: vi.fn().mockResolvedValue(undefined),
  renameAiPreset: vi.fn().mockResolvedValue(undefined),
  deleteAiPreset: vi.fn().mockResolvedValue(undefined),
  showPromptDialog: vi.fn(),
  showConfirmDialog: vi.fn(),
  showChoiceDialog: vi.fn(),
}))

vi.mock('../../core/ai/presets', async () => {
  const real = await vi.importActual<typeof import('../../core/ai/presets')>('../../core/ai/presets')
  return {
    ...real,
    saveAiPreset: m.saveAiPreset,
    updateAiPreset: m.updateAiPreset,
    applyAiPreset: m.applyAiPreset,
    renameAiPreset: m.renameAiPreset,
    deleteAiPreset: m.deleteAiPreset,
  }
})
vi.mock('../../lib/dialog', () => ({
  showPromptDialog: m.showPromptDialog,
  showConfirmDialog: m.showConfirmDialog,
  showChoiceDialog: m.showChoiceDialog,
}))

import { PresetBar } from './PresetBar'

const view = (id: string, model: string) => ({
  id,
  name: id.toUpperCase(),
  provider: 'ollama',
  baseUrl: 'http://x',
  model,
  systemPrompt: '',
  hasApiKey: false,
})

function cfg(over: Partial<AiConfig> = {}): AiConfig {
  return {
    chatProvider: 'ollama',
    chatBaseUrl: 'http://x',
    chatModel: 'a',
    chatSystemPrompt: '',
    chatApiKey: '',
    embeddingProvider: 'ollama',
    embeddingBaseUrl: 'http://x',
    embeddingModel: 'old-embed',
    embeddingApiKey: '',
    activePresets: { chat: 'p1', embedding: 'e1' },
    presets: {
      chat: [view('p1', 'a'), view('p2', 'b')],
      embedding: [view('e1', 'old-embed'), view('e2', 'new-embed')],
      transcription: [],
      deepResearch: [],
      webSearch: [],
    },
    ...over,
  } as unknown as AiConfig
}

const pick = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: /saved setup$/i }))
  fireEvent.pointerDown(screen.getByText(name))
}

beforeEach(() => vi.clearAllMocks())

describe('PresetBar', () => {
  it('Save as prompts for a name and saves', async () => {
    m.showPromptDialog.mockResolvedValue('Mine')
    render(<PresetBar section="chat" config={cfg()} />)
    fireEvent.click(screen.getByText('Save as…'))
    await waitFor(() => expect(m.saveAiPreset).toHaveBeenCalledWith('chat', 'Mine'))
  })

  it('shows (modified) when the live fields differ', () => {
    render(<PresetBar section="chat" config={cfg({ chatModel: 'edited' })} />)
    expect(screen.getByText('P1 (modified)')).toBeTruthy()
  })

  it('a modified switch asks first and Cancel applies nothing', async () => {
    m.showChoiceDialog.mockResolvedValue(null)
    render(<PresetBar section="chat" config={cfg({ chatModel: 'edited' })} />)
    pick('P2')
    await waitFor(() => expect(m.showChoiceDialog).toHaveBeenCalled())
    expect(m.applyAiPreset).not.toHaveBeenCalled()
    expect(m.updateAiPreset).not.toHaveBeenCalled()
  })

  it('"Update preset first" updates then applies', async () => {
    m.showChoiceDialog.mockResolvedValue('update')
    render(<PresetBar section="chat" config={cfg({ chatModel: 'edited' })} />)
    pick('P2')
    await waitFor(() => expect(m.applyAiPreset).toHaveBeenCalledWith('chat', 'p2'))
    expect(m.updateAiPreset).toHaveBeenCalledWith('chat', 'p1')
  })

  it('an embedding switch to another model offers a re-index', async () => {
    m.showConfirmDialog.mockResolvedValue(true)
    const onReindex = vi.fn()
    render(<PresetBar section="embedding" config={cfg()} onReindex={onReindex} />)
    pick('E2')
    await waitFor(() => expect(onReindex).toHaveBeenCalled())
    expect(m.showConfirmDialog.mock.calls[0][0].message).toContain('old-embed')
    expect(m.applyAiPreset).toHaveBeenCalledWith('embedding', 'e2')
  })

  it('declining the re-index still applies', async () => {
    m.showConfirmDialog.mockResolvedValue(false)
    const onReindex = vi.fn()
    render(<PresetBar section="embedding" config={cfg()} onReindex={onReindex} />)
    pick('E2')
    await waitFor(() => expect(m.applyAiPreset).toHaveBeenCalledWith('embedding', 'e2'))
    expect(onReindex).not.toHaveBeenCalled()
  })

  it('Delete confirms before deleting', async () => {
    m.showConfirmDialog.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<PresetBar section="chat" config={cfg()} />)
    fireEvent.click(screen.getByText('Manage'))
    fireEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(m.showConfirmDialog).toHaveBeenCalledTimes(1))
    expect(m.deleteAiPreset).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(m.deleteAiPreset).toHaveBeenCalledWith('chat', 'p1'))
    expect(m.showConfirmDialog.mock.calls[1][0].danger).toBe(true)
  })
})
