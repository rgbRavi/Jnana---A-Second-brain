// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'
import type { AiConfig, Note } from '../../../types'

// Mock the provider so the loop runs without a backend.
const { chatWithTools } = vi.hoisted(() => ({ chatWithTools: vi.fn() }))
vi.mock('../provider', () => ({ chatWithTools }))

import { runAgent } from './run'

const config = { chatProvider: 'openai', chatModel: 'gpt-4o' } as unknown as AiConfig
const notes: Note[] = [
  { id: 'a', title: 'Alpha', content: 'Alpha content', tags: [], createdAt: 0, updatedAt: 0 },
]

describe('runAgent', () => {
  it('runs a read tool, stages a write proposal, then returns the final answer', async () => {
    chatWithTools
      .mockResolvedValueOnce({ content: '', toolCalls: [{ id: '1', name: 'read_note', args: { note: 'Alpha' } }] })
      .mockResolvedValueOnce({ content: '', toolCalls: [{ id: '2', name: 'create_note', args: { title: 'Summary', content: 'x' } }] })
      .mockResolvedValueOnce({ content: 'Done.', toolCalls: [] })

    const seen: string[] = []
    const res = await runAgent(config, 'summarize alpha', [], notes, { onStep: (s) => seen.push(s.tool) })

    expect(res.answer).toBe('Done.')
    expect(seen).toEqual(['read_note', 'create_note'])
    expect(res.proposals).toHaveLength(1)
    expect(res.proposals[0].kind).toBe('create')
    expect(res.proposals[0].title).toBe('Summary')
  })

  it('systemExtra is appended to the system prompt', async () => {
    chatWithTools.mockReset()
    chatWithTools.mockResolvedValueOnce({ content: 'ok', toolCalls: [] })
    await runAgent(config, 'hi', [], notes, { systemExtra: 'EXTRA-BLOCK' })
    const sys = chatWithTools.mock.calls[0][1][0]
    expect(sys.role).toBe('system')
    expect(sys.content).toMatch(/note-taking agent[\s\S]*\n\nEXTRA-BLOCK$/)
  })

  it('leadingSystem is sent before SYSTEM; empty leaves SYSTEM first', async () => {
    chatWithTools.mockReset()
    chatWithTools.mockResolvedValue({ content: 'ok', toolCalls: [] })
    await runAgent(config, 'hi', [], notes, { leadingSystem: 'USER-PROMPT' })
    const m = chatWithTools.mock.calls[0][1]
    expect(m[0]).toEqual({ role: 'system', content: 'USER-PROMPT' })
    expect(m[1].content).toMatch(/note-taking agent/)
    await runAgent(config, 'hi', [], notes, { leadingSystem: '' })
    expect(chatWithTools.mock.calls[1][1][0].content).toMatch(/note-taking agent/)
  })

  it('a model that never stops calling tools still yields a final answer at maxSteps', async () => {
    chatWithTools.mockReset()
    chatWithTools.mockImplementation(async (_c: unknown, _m: unknown, tools: unknown[]) =>
      tools.length === 0
        ? { content: 'final', toolCalls: [] }
        : { content: '', toolCalls: [{ id: 'x', name: 'read_note', args: { note: 'Alpha' } }] })
    const res = await runAgent(config, 'loop', [], notes, { maxSteps: 20 })
    expect(res.answer).toBe('final')
    expect(res.steps).toHaveLength(20)
    expect(chatWithTools).toHaveBeenCalledTimes(21)
  })

  it('aborting mid-run makes no further model calls and keeps the steps so far', async () => {
    chatWithTools.mockReset()
    chatWithTools.mockResolvedValue({ content: 'Reading Alpha.', toolCalls: [{ id: 'x', name: 'read_note', args: { note: 'Alpha' } }] })
    const ctrl = new AbortController()
    const res = await runAgent(config, 'loop', [], notes, { maxSteps: 20, signal: ctrl.signal, onStep: () => ctrl.abort() })
    expect(chatWithTools).toHaveBeenCalledTimes(1)
    expect(res.steps).toHaveLength(1)
    expect(res.answer).toBe('Reading Alpha.')
  })

  it('a stop mid-round skips the round\'s remaining tool calls', async () => {
    chatWithTools.mockReset()
    chatWithTools.mockResolvedValue({
      content: 'Reading.',
      toolCalls: [
        { id: '1', name: 'read_note', args: { note: 'Alpha' } },
        { id: '2', name: 'read_note', args: { note: 'Alpha' } },
        { id: '3', name: 'read_note', args: { note: 'Alpha' } },
      ],
    })
    const ctrl = new AbortController()
    const res = await runAgent(config, 'x', [], notes, { signal: ctrl.signal, onStep: () => ctrl.abort() })
    expect(res.steps).toHaveLength(1)
    expect(chatWithTools).toHaveBeenCalledTimes(1)
  })

  it('returns the answer directly when the model calls no tools', async () => {
    chatWithTools.mockReset()
    chatWithTools.mockResolvedValueOnce({ content: 'Just an answer.', toolCalls: [] })

    const res = await runAgent(config, 'hi', [], notes)

    expect(res.answer).toBe('Just an answer.')
    expect(res.steps).toHaveLength(0)
    expect(res.proposals).toHaveLength(0)
  })
})
