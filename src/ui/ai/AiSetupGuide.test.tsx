// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const testAiConnection = vi.fn()
vi.mock('../../core/ai', async (orig) => ({
  ...(await orig<typeof import('../../core/ai')>()),
  testAiConnection: (...a: unknown[]) => testAiConnection(...a),
}))
const confirmDialog = vi.fn().mockResolvedValue(true)
vi.mock('../../lib/dialog', () => ({ showConfirmDialog: (...a: unknown[]) => confirmDialog(...a) }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }))

import { AiSetupGuide } from './AiSetupGuide'
import { defaultConfig } from '../../core/ai'
import type { AiConfig } from '../../types'

function setup(onChange = vi.fn().mockResolvedValue(true)) {
  const onFinish = vi.fn()
  const prior = { ...defaultConfig(), enabled: true }
  render(
    <MemoryRouter>
      <AiSetupGuide
        config={prior}
        onChange={onChange}
        onReindex={() => {}}
        noteCount={3}
        onFinish={onFinish}
        onSkip={() => {}}
      />
    </MemoryRouter>,
  )
  return { onChange, onFinish, prior }
}

beforeEach(() => testAiConnection.mockReset())

describe('AiSetupGuide', () => {
  it('local path saves Ollama with the model it tells you to pull, then lands on ready', async () => {
    testAiConnection.mockResolvedValue({ ok: true, message: 'Connected.' })
    const { onChange } = setup()
    fireEvent.click(screen.getByLabelText(/On this computer/))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('ollama pull llama3.2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Connect & test' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /ready/ })).toBeTruthy())
    const saved = onChange.mock.calls[0][0] as AiConfig
    expect(saved.chatProvider).toBe('ollama')
    expect(saved.chatModel).toBe('llama3.2')
    expect(saved.embeddingModel).toBe('nomic-embed-text')
    expect(testAiConnection).toHaveBeenCalledWith('chat', 'ollama', 'llama3.2')
  })

  it('keeps you on the connect step with the advice when the test fails', async () => {
    testAiConnection.mockResolvedValue({ ok: false, message: "Couldn't reach Ollama." })
    setup()
    fireEvent.click(screen.getByLabelText(/On this computer/))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect & test' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Ollama.")
    expect(screen.getByRole('heading', { name: 'Connect Ollama' })).toBeTruthy()
  })

  it('cloud path needs a key before saving anything', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByLabelText(/Cloud service/))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect & test' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Paste your API key first.')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('restores the previous config when the test fails and you ask', async () => {
    testAiConnection.mockResolvedValue({ ok: false, message: 'nope' })
    const { onChange, prior } = setup()
    fireEvent.click(screen.getByLabelText(/On this computer/))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect & test' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Restore previous settings' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    expect(onChange.mock.calls[1][0]).toBe(prior)
  })

  it('does not show a pull command for an unsafe model name', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByLabelText(/On this computer/))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'llama3.2; rm -rf' } })
    expect(screen.queryByText(/ollama pull llama/)).toBeNull()
    expect(screen.getByText('Enter a valid model name below.')).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })
})
