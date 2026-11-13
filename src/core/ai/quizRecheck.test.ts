// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiConfig, QuizQuestion } from '../../types'

const { complete, webSearch, fetchPageText, hasWebSearch } = vi.hoisted(() => ({
  complete: vi.fn(),
  webSearch: vi.fn(),
  fetchPageText: vi.fn(),
  hasWebSearch: vi.fn(),
}))
vi.mock('./provider', () => ({ getChatProvider: () => ({ complete }) }))
vi.mock('./web', () => ({ webSearch, fetchPageText }))
vi.mock('./config', () => ({ hasWebSearch }))

import { recheckQuestion } from './quizRecheck'

const config = {} as unknown as AiConfig
const q: QuizQuestion = {
  kind: 'recall', format: 'mcq', question: 'Capital of Australia?', options: ['Sydney', 'Canberra', 'Perth'],
  correct: [0], answer: 'Sydney', explanation: '', marks: 1,
}
const PAGE = { url: 'https://a.test/x?a=1&b=2', title: 'Australia', text: 'The capital city of Australia is Canberra, not Sydney.' }
/** The recheck call gets `recheck`; the independent confirm call (verifyGrounded) gets `confirm`. */
const respond = (recheck: string, confirm: string | Error = '[{"supported":true}]') =>
  complete.mockImplementation(async (prompt: string) => {
    if (!prompt.includes('ITEMS:')) return recheck
    if (confirm instanceof Error) throw confirm
    return confirm
  })
const reply = (o: object) => JSON.stringify({ verdict: 'key-wrong', correct: [1], answer: 'Canberra', explanation: 'e', correctOptions: ['Canberra'], page: 1, quote: 'The capital city of Australia is Canberra', ...o })

beforeEach(() => {
  vi.resetAllMocks()
  hasWebSearch.mockReturnValue(true)
  webSearch.mockResolvedValue([{ title: 'Australia', url: PAGE.url, snippet: '' }])
  fetchPageText.mockResolvedValue(PAGE)
})

describe('recheckQuestion', () => {
  it('corrects a wrong MCQ key with quoted evidence', async () => {
    respond(reply({}))
    const out = await recheckQuestion(q, config)
    expect(out.kind).toBe('corrected')
    if (out.kind !== 'corrected') return
    expect(out.question).toMatchObject({ correct: [1], answer: 'Canberra', corrected: true })
    expect(out.evidence.url).toBe(PAGE.url)
    expect(out.question.source).toEqual(out.evidence)
  })

  it("returns unclear when the evidence quote isn't on the page", async () => {
    respond(reply({ quote: 'Melbourne is the capital of Australia' }))
    expect((await recheckQuestion(q, config)).kind).toBe('unclear')
  })

  it('returns unclear for a page index we did not show', async () => {
    respond(reply({ page: 7 }))
    expect((await recheckQuestion(q, config)).kind).toBe('unclear')
  })

  it('returns unclear when the model gives an mcq two correct indices', async () => {
    respond(reply({ correct: [0, 1] }))
    expect((await recheckQuestion(q, config)).kind).toBe('unclear')
  })

  it('confirms a right key with evidence', async () => {
    respond(reply({ verdict: 'key-correct' }))
    expect((await recheckQuestion(q, config)).kind).toBe('confirmed')
  })

  it('returns unclear without a provider or cited page', async () => {
    hasWebSearch.mockReturnValue(false)
    expect(await recheckQuestion(q, config)).toEqual({ kind: 'unclear', reason: 'No web search provider is set up.' })
    expect(complete).not.toHaveBeenCalled()
  })

  it('returns unclear instead of throwing when the call fails', async () => {
    complete.mockRejectedValue(new Error('boom https://secret.test'))
    expect((await recheckQuestion(q, config)).kind).toBe('unclear')
  })

  it('returns unclear when the indices are off by one from the stated answer', async () => {
    respond(reply({ correct: [2], correctOptions: ['Canberra'] }))
    expect((await recheckQuestion(q, config)).kind).toBe('unclear')
  })

  it('uses the option text as the corrected answer', async () => {
    respond(reply({ correctOptions: ['canberra'] }))
    const out = await recheckQuestion(q, config)
    expect(out.kind === 'corrected' && out.question.answer).toBe('Canberra')
  })

  it('returns unclear when key-wrong names the same key', async () => {
    respond(reply({ correct: [0], correctOptions: ['Sydney'] }))
    expect((await recheckQuestion(q, config)).kind).toBe('unclear')
  })

  it('returns unclear when the answer text merely mentions the old key', async () => {
    respond(reply({ correct: [0], answer: 'Canberra, not Sydney', correctOptions: ['Canberra, not Sydney'] }))
    expect((await recheckQuestion(q, config)).kind).toBe('unclear')
  })

  it('corrects an mcma key from two exact option texts', async () => {
    const m: QuizQuestion = { ...q, format: 'mcma', options: ['A1', 'B2', 'C3', 'D4'], correct: [0, 1] }
    respond(reply({ correct: [2, 3], correctOptions: ['C3', 'D4'] }))
    const out = await recheckQuestion(m, config)
    expect(out.kind === 'corrected' && out.question.correct).toEqual([2, 3])
  })

  it('asks neutrally, never mentioning a dispute or the student', async () => {
    respond(reply({ verdict: 'key-correct' }))
    await recheckQuestion(q, config)
    const { system } = complete.mock.calls[0][1] as { system: string }
    expect(system).not.toMatch(/disput|student/i)
  })

  it('a biased "key-wrong" with a real but unsupportive quote stays unclear via the confirm step', async () => {
    const right: QuizQuestion = { ...q, correct: [1], answer: 'Canberra' }
    respond(
      reply({ correct: [0], answer: 'Sydney', correctOptions: ['Sydney'], quote: 'The capital city of Australia is Canberra, not Sydney' }),
      '[{"supported":false}]',
    )
    expect((await recheckQuestion(right, config)).kind).toBe('unclear')
    expect(complete).toHaveBeenCalledTimes(2)
    const confirm = complete.mock.calls[1][0] as string
    expect(confirm).toContain(PAGE.text)
    expect(confirm).toContain('"key":["Sydney"]')
  })

  it('returns unclear when the confirm call fails', async () => {
    respond(reply({}), new Error('boom'))
    expect((await recheckQuestion(q, config)).kind).toBe('unclear')
  })

  it("returns unclear, without confirming, when the quote doesn't name the new option", async () => {
    respond(reply({ quote: 'The capital city of Australia is' }))
    expect((await recheckQuestion(q, config)).kind).toBe('unclear')
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('checks the quote against the part of the page the model was shown', async () => {
    fetchPageText.mockResolvedValue({ ...PAGE, text: `${'Unrelated filler words here. '.repeat(1000)}${PAGE.text}` })
    respond(reply({}))
    expect((await recheckQuestion(q, config)).kind).toBe('unclear')
  })

  it('never selects an empty option', async () => {
    const e: QuizQuestion = { ...q, options: ['', 'Canberra', 'Perth'], correct: [2] }
    respond(reply({ correct: [0], answer: 'x', correctOptions: [''] }))
    expect((await recheckQuestion(e, config)).kind).toBe('unclear')
  })
})
