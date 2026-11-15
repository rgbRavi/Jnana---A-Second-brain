// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it, vi } from 'vitest'
import type { AiConfig, AnalyzeInput, Note, QuizSettings } from '../../types'
import { QUIZ_SETTINGS_DEFAULTS } from '../../hooks/useQuizSettings'

// Mock the provider so generateQuiz's vault-filtering can be exercised without
// a real backend — mirrors agent/run.test.ts's pattern.
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('./provider', () => ({ getChatProvider: () => ({ complete }) }))
// Pass-through, so a test can hand generateQuiz a context with images.
vi.mock('./noteContext', async (importOriginal) => {
  const real = await importOriginal<typeof import('./noteContext')>()
  return { ...real, buildNoteContext: vi.fn(real.buildNoteContext) }
})

import { buildNoteContext } from './noteContext'
import { buildQuizSystemPrompt, generateQuiz, parseQuiz, quoteAppears, rawScopeNotes } from './quiz'

const settings = (patch: Partial<QuizSettings> = {}): QuizSettings => ({
  ...QUIZ_SETTINGS_DEFAULTS,
  ...patch,
})

const note = (id: string, title: string, content: string, updatedAt = 1000, vaultId?: string): Note => ({
  id,
  title,
  content,
  tags: [],
  createdAt: updatedAt,
  updatedAt,
  ...(vaultId ? { vaultId } : {}),
})

describe('buildQuizSystemPrompt', () => {
  it('states the exact count and only the enabled formats', () => {
    const p = buildQuizSystemPrompt(
      settings({ count: 9, formats: { mcq: true, mcma: false, descriptive: false } }),
    )
    expect(p).toContain('exactly 9')
    expect(p).toContain('"mcq"')
    expect(p).not.toContain('"mcma"')
    expect(p).not.toContain('"descriptive"')
  })

  it('describes the requested difficulty', () => {
    expect(buildQuizSystemPrompt(settings({ difficulty: 'hard' }))).toContain('hard')
    expect(buildQuizSystemPrompt(settings({ difficulty: 'mix' }))).toContain('mix')
  })
})

// Today's notes prompt, verbatim — the 'notes' grounding must never drift from it.
const NOTES_PROMPT_DEFAULT = `You are a study quiz generator for a personal knowledge app. Using ONLY the provided
notes (never outside facts), write exactly 6 questions that test understanding.
Difficulty: mix — spread the questions across recall, application and comparison.

Allowed formats — use only these, spread evenly across them:
- "mcq" — exactly 4 entries in "options" and exactly one index in "correct"
- "mcma" — exactly 4 entries in "options" and two or more indices in "correct"
- "descriptive" — no "options"/"correct"; the student writes a short answer

For every question give "answer" (the correct answer written out) and "explanation" (one sentence
on why it is right). Distractor options must be plausible and drawn from the notes' subject matter.
If the notes are too thin to quiz, return an empty array.

Respond with ONLY a JSON array, no prose:
[{"kind":"recall","format":"mcq","question":"…","options":["…","…","…","…"],"correct":[1],"answer":"…","explanation":"…"}]`

const NOTES_PROMPT_EASY_DESCRIPTIVE = `You are a study quiz generator for a personal knowledge app. Using ONLY the provided
notes (never outside facts), write exactly 3 questions that test understanding.
Difficulty: easy — definitions and direct recall of what the notes state.

Allowed formats — use only these, spread evenly across them:
- "descriptive" — no "options"/"correct"; the student writes a short answer

For every question give "answer" (the correct answer written out) and "explanation" (one sentence
on why it is right). Distractor options must be plausible and drawn from the notes' subject matter.
If the notes are too thin to quiz, return an empty array.

Respond with ONLY a JSON array, no prose:
[{"kind":"recall","format":"descriptive","question":"…","answer":"…","explanation":"…"}]`

describe('buildQuizSystemPrompt — notes grounding is unchanged', () => {
  it('matches the pre-grounding prompt byte for byte', () => {
    expect(buildQuizSystemPrompt(settings())).toBe(NOTES_PROMPT_DEFAULT)
    const easy = settings({ count: 3, difficulty: 'easy', formats: { mcq: false, mcma: false, descriptive: true } })
    expect(buildQuizSystemPrompt(easy)).toBe(NOTES_PROMPT_EASY_DESCRIPTIVE)
  })

  it('keeps the medium and hard wording', () => {
    expect(buildQuizSystemPrompt(settings({ difficulty: 'medium' }))).toContain(
      'Difficulty: medium — apply an idea from the notes to a short scenario.',
    )
    expect(buildQuizSystemPrompt(settings({ difficulty: 'hard' }))).toContain(
      'Difficulty: hard — compare, contrast or synthesize across several ideas in the notes.',
    )
  })
})

describe('buildQuizSystemPrompt — web and ai groundings', () => {
  it('ai asks for general knowledge and never mentions notes', () => {
    const p = buildQuizSystemPrompt(settings({ difficulty: 'easy' }), 'ai')
    expect(p).toContain('general knowledge')
    expect(p).not.toMatch(/notes/i)
    expect(p).not.toContain('ONLY the provided')
  })

  it('web refers to the pages and shows the citation fields in the exemplar', () => {
    const p = buildQuizSystemPrompt(settings({ difficulty: 'hard' }), 'web')
    expect(p).toContain('web pages')
    expect(p).not.toMatch(/notes/i)
    expect(p).toMatch(/"page":1,"quote":"…"\}\]$/)
  })
})

describe('parseQuiz', () => {
  const good = JSON.stringify([
    {
      kind: 'recall',
      format: 'mcq',
      question: 'What is a tensor?',
      options: ['A', 'B', 'C', 'D'],
      correct: [1],
      answer: 'B',
      explanation: 'because',
    },
  ])

  it('parses a question and stamps the marks from settings', () => {
    const out = parseQuiz(good, settings({ weights: { mcq: 3, mcma: 1, descriptive: 1 } }), [])
    expect(out).toHaveLength(1)
    expect(out[0].marks).toBe(3)
    expect(out[0].format).toBe('mcq')
  })

  it('defaults a question with no format to descriptive', () => {
    const raw = JSON.stringify([
      { kind: 'recall', question: 'Explain entropy.', answer: 'x', explanation: '' },
    ])
    expect(parseQuiz(raw, settings(), [])[0].format).toBe('descriptive')
  })

  it('drops questions whose format the user disabled', () => {
    const out = parseQuiz(good, settings({ formats: { mcq: false, mcma: true, descriptive: true } }), [])
    expect(out).toEqual([])
  })

  it('drops choice questions with unusable options or correct indices', () => {
    const raw = JSON.stringify([
      { format: 'mcq', question: 'No options?', correct: [0], answer: 'a', explanation: '' },
      { format: 'mcq', question: 'Out of range?', options: ['A', 'B'], correct: [7], answer: 'a', explanation: '' },
    ])
    expect(parseQuiz(raw, settings(), [])).toEqual([])
  })

  it('promotes a multi-answer mcq to mcma when mcma is enabled', () => {
    const raw = JSON.stringify([
      { format: 'mcq', question: 'Pick all', options: ['A', 'B', 'C'], correct: [0, 2], answer: 'A and C', explanation: '' },
    ])
    expect(parseQuiz(raw, settings(), [])[0].format).toBe('mcma')
  })

  it('keeps only the first correct index when mcma is disabled', () => {
    const raw = JSON.stringify([
      { format: 'mcq', question: 'Pick all', options: ['A', 'B', 'C'], correct: [0, 2], answer: 'A and C', explanation: '' },
    ])
    const out = parseQuiz(raw, settings({ formats: { mcq: true, mcma: false, descriptive: true } }), [])
    expect(out[0].format).toBe('mcq')
    expect(out[0].correct).toEqual([0])
  })

  it('drops a question already asked, ignoring case and punctuation', () => {
    expect(parseQuiz(good, settings(), ['what is a TENSOR'])).toEqual([])
  })

  it('drops duplicates within a single response', () => {
    const raw = JSON.stringify([
      { format: 'descriptive', question: 'Explain entropy.', answer: 'a', explanation: '' },
      { format: 'descriptive', question: 'explain ENTROPY', answer: 'a', explanation: '' },
    ])
    expect(parseQuiz(raw, settings(), [])).toHaveLength(1)
  })

  it('returns an empty array for junk instead of throwing', () => {
    expect(parseQuiz('the model refused', settings(), [])).toEqual([])
    expect(parseQuiz('{"not":"an array"}', settings(), [])).toEqual([])
  })
})

describe('parseQuiz — web pages', () => {
  const page = { url: 'https://a.example/team', title: 'Team 7', text: 'Team 7 is led by Kakashi Hatake in the original series.' }
  const item = (patch: Record<string, unknown> = {}) =>
    JSON.stringify([
      {
        format: 'descriptive',
        question: 'Who leads Team 7?',
        answer: 'Kakashi',
        explanation: '',
        page: 1,
        quote: 'Team 7 is led by Kakashi Hatake',
        ...patch,
      },
    ])

  it('attaches the source when the quote is on its page', () => {
    const out = parseQuiz(item(), settings(), [], { pages: [page] })
    expect(out[0].source).toEqual({ url: page.url, title: 'Team 7', quote: 'Team 7 is led by Kakashi Hatake' })
  })

  it('drops a question whose quote is not on its page', () => {
    expect(parseQuiz(item({ quote: 'Team 7 is led by Jiraiya the Sannin' }), settings(), [], { pages: [page] })).toEqual([])
  })

  it("drops a question citing a page that wasn't fetched", () => {
    expect(parseQuiz(item({ page: 2 }), settings(), [], { pages: [page] })).toEqual([])
    expect(parseQuiz(item({ page: undefined, sourceUrl: page.url }), settings(), [], { pages: [page] })).toEqual([])
  })

  it('keeps the literal URL of a page with a query string', () => {
    const q = { ...page, url: 'https://a.example/read?id=7&lang=en' }
    expect(parseQuiz(item(), settings(), [], { pages: [q] })[0].source?.url).toBe(q.url)
  })

  it('reports each page/quote-check drop', () => {
    const onDropped = vi.fn()
    const raw = JSON.stringify([
      ...JSON.parse(item({ quote: 'Team 7 is led by Jiraiya the Sannin' })),
      ...JSON.parse(item({ question: 'Second?', page: 9 })),
      ...JSON.parse(item({ question: 'Third?' })),
    ])
    expect(parseQuiz(raw, settings(), [], { pages: [page], onDropped })).toHaveLength(1)
    expect(onDropped).toHaveBeenCalledTimes(2)
  })

  it('drops a question with no quote at all', () => {
    expect(parseQuiz(item({ quote: undefined }), settings(), [], { pages: [page] })).toEqual([])
  })
})

describe('quoteAppears', () => {
  it('ignores case, whitespace and curly quotes', () => {
    expect(quoteAppears('“Team 7”  is led', 'We know "team 7" is led by Kakashi.')).toBe(true)
  })

  it('normalizes dashes', () => {
    expect(quoteAppears('the 1999–2007 run', 'During the 1999-2007 run it aired weekly.')).toBe(true)
  })

  it('rejects quotes shorter than 12 chars', () => {
    expect(quoteAppears('Team 7', 'Team 7 is led by Kakashi.')).toBe(false)
  })

  it('rejects text that is not on the page', () => {
    expect(quoteAppears('Team 7 is led by Jiraiya', 'Team 7 is led by Kakashi.')).toBe(false)
  })

  it('rejects quotes longer than 300 chars, even when they are on the page', () => {
    const text = 'Team 7 is led by Kakashi. '.repeat(20)
    expect(quoteAppears(text.slice(0, 300), text)).toBe(true)
    expect(quoteAppears(text.slice(0, 301), text)).toBe(false)
  })
})

describe('rawScopeNotes', () => {
  const notes = [
    note('1', 'Tensors', 'A tensor is a generalization of vectors.', 500),
    note('2', 'Entropy', 'Entropy measures disorder.', 1500),
  ]

  it('returns just the selected notes in note mode', () => {
    expect(rawScopeNotes({ mode: 'note', noteIds: ['2'] }, notes).map((n) => n.id)).toEqual(['2'])
    const both: AnalyzeInput = { mode: 'note', noteIds: ['2', '1'] }
    expect(rawScopeNotes(both, notes).map((n) => n.id).sort()).toEqual(['1', '2'])
  })

  it('filters by the time window in window mode', () => {
    const input: AnalyzeInput = { mode: 'window', since: 1000, until: 2000, label: 'w' }
    expect(rawScopeNotes(input, notes).map((n) => n.id)).toEqual(['2'])
  })

  it('substring-matches title and body in topic mode', () => {
    const input: AnalyzeInput = { mode: 'topic', query: 'TENSOR' }
    expect(rawScopeNotes(input, notes).map((n) => n.id)).toEqual(['1'])
  })
})

describe('generateQuiz — raw source stays inside the active vault', () => {
  const config = { chatProvider: 'openai', chatModel: 'gpt-4o' } as unknown as AiConfig

  it('excludes another vault\'s notes even when their content matches the topic', async () => {
    complete.mockReset().mockResolvedValue('[]')
    const notes = [
      note('1', 'Vault A note', 'shared-topic content', 1000, 'vault-a-test'),
      note('2', 'Vault B note', 'shared-topic content', 1000, 'vault-b-test'),
    ]
    const input: AnalyzeInput = { mode: 'topic', query: 'shared-topic' }
    await generateQuiz(input, config, notes, settings({ source: 'raw' }), 'vault-a-test')

    expect(complete).toHaveBeenCalled()
    const prompt = complete.mock.calls[0][0] as string
    expect(prompt).toContain('Vault A note')
    expect(prompt).not.toContain('Vault B note')
  })
})

describe('generateQuiz — verification', () => {
  const config = { chatProvider: 'openai', chatModel: 'gpt-4o' } as unknown as AiConfig
  const notes = [note('1', 'T', 'tensor content', 1000, 'vault-ver')]
  const input: AnalyzeInput = { mode: 'note', noteIds: ['1'] }
  const gen = (qs: string[]) =>
    JSON.stringify(qs.map((question) => ({ format: 'descriptive', question, answer: 'a', explanation: '' })))
  const run = (patch: Partial<QuizSettings>) =>
    generateQuiz(input, config, notes, settings({ source: 'raw', count: 2, ...patch }), 'vault-ver')
  const verdicts = (...v: boolean[]) => JSON.stringify(v.map((supported) => ({ supported })))

  it('runs no verification call when verify is off and marks verified off', async () => {
    complete.mockReset().mockResolvedValue(gen(['Alpha one?', 'Beta two?']))
    const res = await run({ verify: false })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(res.meta?.verified).toBe('off')
    expect(res.questions).toHaveLength(2)
  })

  it('marks verified failed and keeps questions when the verifier reply is prose', async () => {
    complete.mockReset().mockResolvedValueOnce(gen(['Gamma three?', 'Delta four?'])).mockResolvedValueOnce('seems fine')
    const res = await run({ verify: true })
    expect(res.meta?.verified).toBe('failed')
    expect(res.questions).toHaveLength(2)
  })

  it('reports nothing-verified when every question is unsupported', async () => {
    complete.mockReset().mockImplementation(async (_p: string, o: { system: string }) =>
      o.system.includes('fact-checker') ? verdicts(false, false) : gen(['Eps five?', 'Zeta six?']),
    )
    const res = await run({ verify: true })
    expect(res.questions).toEqual([])
    expect(res.reason).toBe('nothing-verified')
    expect(res.meta?.dropped).toBeGreaterThan(0)
  })

  it('makes at most one top-up round', async () => {
    complete.mockReset()
      .mockResolvedValueOnce(gen(['Eta seven?', 'Theta eight?']))
      .mockResolvedValueOnce(verdicts(true, false))
      .mockResolvedValueOnce(gen(['Iota nine?', 'Kappa ten?']))
      .mockResolvedValueOnce(verdicts(true, false))
      .mockResolvedValue('[]')
    const res = await run({ verify: true, count: 3 })
    expect(complete.mock.calls.length).toBeLessThanOrEqual(4)
    expect(res.questions).toHaveLength(2)
    expect(res.meta?.dropped).toBe(2)
  })

  it('shows the verifier the images the quiz was built from', async () => {
    vi.mocked(buildNoteContext).mockResolvedValueOnce({ text: 'notes ctx', images: ['data:image/png;base64,AA'] })
    complete.mockReset().mockImplementation(async (_p: string, o: { system: string }) =>
      o.system.includes('fact-checker') ? verdicts(true, true) : gen(['Lambda?', 'Mu?']),
    )
    await run({ verify: true })
    const verifyCall = complete.mock.calls.find(([, o]) => o.system.includes('fact-checker'))!
    expect(verifyCall[1].images).toEqual(['data:image/png;base64,AA'])
  })
})

describe('generateQuiz — a topic the notes do not cover', () => {
  const config = { chatProvider: 'openai', chatModel: 'gpt-4o' } as unknown as AiConfig
  const notes = [note('1', 'Convolutions', 'naruto-free computer vision notes', 1000, 'vault-cv')]
  const input: AnalyzeInput = { mode: 'topic', query: 'naruto' }

  it('names the topic in the prompt and reports off-topic when the model declines', async () => {
    complete.mockReset().mockResolvedValue('[]')
    const res = await generateQuiz(input, config, notes, settings({ source: 'raw' }), 'vault-cv')

    expect(res).toEqual({ questions: [], reason: 'off-topic' })
    expect(complete).toHaveBeenCalledTimes(1) // no retry for a quiz it was told not to write
    expect(complete.mock.calls[0][0]).toContain('Make a quiz about "naruto"')
  })

  it('keeps the plain request outside topic mode', async () => {
    complete.mockReset().mockResolvedValue('[]')
    const res = await generateQuiz({ mode: 'note', noteIds: ['1'] }, config, notes, settings({ source: 'raw' }), 'vault-cv')

    expect(res.reason).toBeUndefined()
    expect(complete.mock.calls[0][0]).toContain('Make a quiz from these notes:')
  })
})
