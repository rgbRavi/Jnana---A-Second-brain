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

  it('returns the answer directly when the model calls no tools', async () => {
    chatWithTools.mockReset()
    chatWithTools.mockResolvedValueOnce({ content: 'Just an answer.', toolCalls: [] })

    const res = await runAgent(config, 'hi', [], notes)

    expect(res.answer).toBe('Just an answer.')
    expect(res.steps).toHaveLength(0)
    expect(res.proposals).toHaveLength(0)
  })
})
