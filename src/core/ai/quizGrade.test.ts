// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import type { QuizQuestion, QuizSettings } from '../../types'
import { QUIZ_SETTINGS_DEFAULTS } from '../../hooks/useQuizSettings'
import { emptyAttempt, parseGrades, recomputeTotals, scoreObjective } from './quizGrade'

const settings = (patch: Partial<QuizSettings> = {}): QuizSettings => ({
  ...QUIZ_SETTINGS_DEFAULTS,
  ...patch,
})

const mcq = (correct: number): QuizQuestion => ({
  kind: 'recall',
  format: 'mcq',
  question: 'Pick one',
  options: ['A', 'B', 'C', 'D'],
  correct: [correct],
  answer: 'B',
  explanation: '',
  marks: 1,
})

const mcma = (correct: number[]): QuizQuestion => ({
  kind: 'recall',
  format: 'mcma',
  question: 'Pick all',
  options: ['A', 'B', 'C', 'D'],
  correct,
  answer: 'B and D',
  explanation: '',
  marks: 1,
})

describe('scoreObjective — mcq', () => {
  it('awards full marks for the right option', () => {
    expect(scoreObjective(mcq(1), [1], settings())).toBe(1)
  })

  it('deducts the negative fraction for a wrong option', () => {
    expect(scoreObjective(mcq(1), [2], settings())).toBe(-0.25)
  })

  it('deducts nothing when negative marking is off', () => {
    expect(scoreObjective(mcq(1), [2], settings({ negativeMarking: false }))).toBe(0)
  })

  it('never penalises an unanswered question', () => {
    expect(scoreObjective(mcq(1), [], settings())).toBe(0)
  })

  it('scales the penalty with the question weight', () => {
    expect(scoreObjective({ ...mcq(1), marks: 4 }, [2], settings())).toBe(-1)
  })
})

describe('scoreObjective — mcma rules', () => {
  const q = mcma([1, 3])

  it('allOrNothing: exact set wins full marks', () => {
    expect(scoreObjective(q, [1, 3], settings({ mcmaRule: 'allOrNothing' }))).toBe(1)
  })

  it('allOrNothing: a partially right set is penalised like a wrong answer', () => {
    expect(scoreObjective(q, [1], settings({ mcmaRule: 'allOrNothing' }))).toBe(-0.25)
  })

  it('partial: credits right picks and deducts for wrong ones', () => {
    // one of two correct picked (0.5) minus one wrong pick (0.25)
    expect(scoreObjective(q, [1, 2], settings({ mcmaRule: 'partial' }))).toBe(0.25)
  })

  it('partial: floors a question at zero', () => {
    expect(scoreObjective(q, [0, 2], settings({ mcmaRule: 'partial' }))).toBe(0)
  })

  it('proportional: pro-rates a clean partial answer', () => {
    expect(scoreObjective(q, [1], settings({ mcmaRule: 'proportional' }))).toBe(0.5)
  })

  it('proportional: any wrong pick zeroes the question', () => {
    expect(scoreObjective(q, [1, 2], settings({ mcmaRule: 'proportional' }))).toBe(0)
  })

  it('scores a descriptive question as zero — it is graded by the model', () => {
    const d: QuizQuestion = {
      kind: 'recall', format: 'descriptive', question: 'Explain', answer: 'x',
      explanation: '', marks: 3,
    }
    expect(scoreObjective(d, [], settings())).toBe(0)
  })
})

describe('attempt helpers', () => {
  const questions = [mcq(1), mcma([1, 3])]

  it('creates a blank attempt sized to the questions', () => {
    const a = emptyAttempt(questions, 'Topic: tensors')
    expect(a.responses).toEqual([[], []])
    expect(a.marks).toEqual([null, null])
    expect(a.feedback).toEqual(['', ''])
    expect(a.total).toBe(0)
    expect(a.max).toBe(0)
    expect(a.scopeLabel).toBe('Topic: tensors')
    expect(a.takenAt).toBeGreaterThan(0)
  })

  it('seeds a descriptive response with an empty string, not an array', () => {
    const d: QuizQuestion = {
      kind: 'recall', format: 'descriptive', question: 'Explain', answer: 'x',
      explanation: '', marks: 1,
    }
    expect(emptyAttempt([d], 'scope').responses[0]).toBe('')
  })

  it('totals only graded questions', () => {
    const a = { ...emptyAttempt(questions, 's'), marks: [1, null] }
    const t = recomputeTotals(a)
    expect(t.total).toBe(1)
    expect(t.max).toBe(1) // the ungraded mcma is excluded from the max too
  })

  it('keeps a negative total rather than clamping it', () => {
    const a = { ...emptyAttempt(questions, 's'), marks: [-0.25, -0.25] }
    expect(recomputeTotals(a).total).toBe(-0.5)
    expect(recomputeTotals(a).max).toBe(2)
  })
})

describe('parseGrades', () => {
  it('reads marks and feedback from a clean JSON array', () => {
    const raw = '[{"marks":2,"feedback":"Covers both causes."},{"marks":0,"feedback":"Off topic."}]'
    expect(parseGrades(raw, [3, 3])).toEqual([
      { marks: 2, feedback: 'Covers both causes.' },
      { marks: 0, feedback: 'Off topic.' },
    ])
  })

  it('tolerates a fenced block and surrounding prose', () => {
    const raw = 'Here you go:\n```json\n[{"marks":1,"feedback":"Partly right."}]\n```\nHope that helps!'
    expect(parseGrades(raw, [2])).toEqual([{ marks: 1, feedback: 'Partly right.' }])
  })

  it('clamps to the question cap and rounds to half marks', () => {
    const raw = '[{"marks":9,"feedback":"a"},{"marks":1.3,"feedback":"b"},{"marks":-4,"feedback":"c"}]'
    expect(parseGrades(raw, [3, 3, 3]).map((g) => g.marks)).toEqual([3, 1.5, 0])
  })

  it('returns ungraded entries — never zeroes — when the reply is unparseable', () => {
    expect(parseGrades('the model said no', [2, 2])).toEqual([
      { marks: null, feedback: '' },
      { marks: null, feedback: '' },
    ])
  })

  it('pads a short reply with ungraded entries', () => {
    expect(parseGrades('[{"marks":1,"feedback":"ok"}]', [2, 2])).toEqual([
      { marks: 1, feedback: 'ok' },
      { marks: null, feedback: '' },
    ])
  })
})
