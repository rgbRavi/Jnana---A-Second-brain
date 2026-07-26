// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import type { AnalyzeInput, Note, QuizSettings } from '../../types'
import { QUIZ_SETTINGS_DEFAULTS } from '../../hooks/useQuizSettings'
import { buildQuizSystemPrompt, parseQuiz, rawScopeNotes } from './quiz'

const settings = (patch: Partial<QuizSettings> = {}): QuizSettings => ({
  ...QUIZ_SETTINGS_DEFAULTS,
  ...patch,
})

const note = (id: string, title: string, content: string, updatedAt = 1000): Note => ({
  id,
  title,
  content,
  tags: [],
  createdAt: updatedAt,
  updatedAt,
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

describe('rawScopeNotes', () => {
  const notes = [
    note('1', 'Tensors', 'A tensor is a generalization of vectors.', 500),
    note('2', 'Entropy', 'Entropy measures disorder.', 1500),
  ]

  it('returns just the selected note in note mode', () => {
    const input: AnalyzeInput = { mode: 'note', noteId: '2' }
    expect(rawScopeNotes(input, notes).map((n) => n.id)).toEqual(['2'])
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
