// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it, vi } from 'vitest'
import type { AiConfig, QuizQuestion } from '../../types'

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('./provider', () => ({ getChatProvider: () => ({ complete }) }))

import { parseBlindAnswers, parseVerdicts, verifyBlind, verifyGrounded } from './quizVerify'

const config = {} as unknown as AiConfig
const q = (question: string, extra: Partial<QuizQuestion> = {}): QuizQuestion => ({
  kind: 'recall',
  format: 'descriptive',
  question,
  answer: 'a',
  explanation: '',
  marks: 1,
  ...extra,
})
const mcq = (question: string, correct: number[]): QuizQuestion =>
  q(question, { format: correct.length > 1 ? 'mcma' : 'mcq', options: ['A', 'B', 'C', 'D'], correct })

describe('parseVerdicts', () => {
  it('reads an in-order array', () => {
    expect(parseVerdicts('[{"supported":true},{"supported":false}]', 2)).toEqual([true, false])
  })
  it('accepts fenced JSON', () => {
    expect(parseVerdicts('```json\n[{"supported":true}]\n```', 1)).toEqual([true])
  })
  it('returns null for prose, wrong length or non-boolean entries', () => {
    expect(parseVerdicts('Looks right to me', 2)).toBeNull()
    expect(parseVerdicts('[{"supported":true}]', 2)).toBeNull()
    expect(parseVerdicts('[{"supported":"yes"}]', 1)).toBeNull()
  })
})

describe('verifyGrounded', () => {
  it('keeps everything and reports failed when the call throws', async () => {
    complete.mockReset().mockRejectedValue(new Error('boom'))
    const qs = [q('One?'), q('Two?')]
    expect(await verifyGrounded(qs, 'ctx', config)).toEqual({ kept: qs, dropped: 0, status: 'failed' })
  })
  it('drops unsupported questions', async () => {
    complete.mockReset().mockResolvedValue('[{"supported":true},{"supported":false}]')
    const qs = [q('One?'), q('Two?')]
    const res = await verifyGrounded(qs, 'ctx', config)
    expect(res.kept).toEqual([qs[0]])
    expect(res.dropped).toBe(1)
    expect(res.status).toBe('yes')
    expect(complete.mock.calls[0][1].temperature).toBe(0)
  })
  it('sends a choice key as option text, without the index or free-text answer', async () => {
    complete.mockReset().mockResolvedValue('[{"supported":true},{"supported":true}]')
    await verifyGrounded([mcq('One?', [1]), q('Two?', { answer: 'Because.' })], 'ctx', config)
    const items = JSON.parse((complete.mock.calls[0][0] as string).split('ITEMS:\n')[1])
    expect(items[0]).toEqual({ n: 1, question: 'One?', options: ['A', 'B', 'C', 'D'], key: ['B'] })
    expect(items[1]).toEqual({ n: 2, question: 'Two?', answer: 'Because.' })
  })
  it('passes images through to the verifier call', async () => {
    complete.mockReset().mockResolvedValue('[{"supported":true}]')
    await verifyGrounded([q('One?')], 'ctx', config, ['data:image/png;base64,xx'])
    expect(complete.mock.calls[0][1].images).toEqual(['data:image/png;base64,xx'])
  })
})

describe('verifyBlind', () => {
  it('keeps a choice question only when the blind pick matches', async () => {
    complete.mockReset().mockResolvedValue('[{"picked":["b"]},{"picked":["A"]}]')
    const qs = [mcq('One?', [1]), mcq('Two?', [0, 2])]
    const res = await verifyBlind(qs, config)
    expect(res.kept).toEqual([qs[0]])
    expect(res.dropped).toBe(1)
    expect(res.status).toBe('yes')
  })
  it('never shows the key for choice questions', async () => {
    complete.mockReset().mockResolvedValue('[{"picked":["B"]}]')
    await verifyBlind([mcq('Secret?', [1])], config)
    expect(complete.mock.calls[0][0]).not.toContain('"correct"')
  })
  it('matches picks by exact option text; an index, unknown or ambiguous text disagrees', () => {
    const qs = [mcq('A?', [0, 2]), mcq('B?', [1]), mcq('C?', [1]), q('D?', { format: 'mcq', options: ['X', 'x', 'Y'], correct: [0] })]
    expect(parseBlindAnswers('[{"picked":["C","A"]},{"picked":[1]},{"picked":["Bee"]},{"picked":["X"]}]', qs)).toEqual([true, false, false, false])
    expect(parseBlindAnswers('[{"picked":"B"},{"picked":[]},{"picked":[]},{"picked":[]}]', qs)).toBeNull()
  })
  it('judges descriptive questions by the model verdict', () => {
    expect(parseBlindAnswers('[{"correct":false}]', [q('D?')])).toEqual([false])
    expect(parseBlindAnswers('[{"picked":[1]}]', [q('D?')])).toBeNull()
  })
})
