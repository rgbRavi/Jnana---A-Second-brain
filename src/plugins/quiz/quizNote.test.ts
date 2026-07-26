// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import type { QuizAttempt } from '../../types'
import {
  EMPTY_QUIZ_CONTENT,
  parseAttempt,
  quizToExportMarkdown,
  quizToSearchText,
  serializeAttempt,
} from './quizNote'

const attempt: QuizAttempt = {
  questions: [
    {
      kind: 'recall',
      format: 'mcq',
      question: 'What is a tensor?',
      options: ['A scalar', 'A generalization of vectors', 'A graph', 'A loss'],
      correct: [1],
      answer: 'A generalization of vectors',
      explanation: 'Notes define it that way.',
      marks: 1,
    },
    {
      kind: 'application',
      format: 'descriptive',
      question: 'Explain entropy in your own words.',
      answer: 'A measure of disorder.',
      explanation: '',
      marks: 2,
    },
  ],
  responses: [[1], 'It measures disorder.'],
  marks: [1, 1.5],
  feedback: ['', 'Right idea, thin on detail.'],
  total: 2.5,
  max: 3,
  scopeLabel: 'Topic: tensors',
  takenAt: 1_700_000_000_000,
}

describe('quiz note content', () => {
  it('round-trips an attempt through note content', () => {
    expect(parseAttempt(serializeAttempt(attempt))).toEqual(attempt)
  })

  it('parses the empty content a new quiz note starts with', () => {
    const parsed = parseAttempt(EMPTY_QUIZ_CONTENT)
    expect(parsed).not.toBeNull()
    expect(parsed?.questions).toEqual([])
  })

  it('returns null for content that is not a quiz', () => {
    expect(parseAttempt('just some markdown')).toBeNull()
    expect(parseAttempt('{"nope":true}')).toBeNull()
  })

  it('projects questions and answers into search text, not raw JSON', () => {
    const text = quizToSearchText(serializeAttempt(attempt))
    expect(text).toContain('What is a tensor?')
    expect(text).toContain('A generalization of vectors')
    expect(text).not.toContain('{')
  })

  it('exports readable markdown with options, answers and the score', () => {
    const md = quizToExportMarkdown(serializeAttempt(attempt))
    expect(md).toContain('# Quiz — Topic: tensors')
    expect(md).toContain('**Score:** 2.5 / 3')
    expect(md).toContain('1. What is a tensor?')
    expect(md).toContain('- [x] A generalization of vectors')
    expect(md).toContain('- [ ] A scalar')
    expect(md).toContain('Right idea, thin on detail.')
  })

  it('exports a placeholder for an empty quiz note', () => {
    expect(quizToExportMarkdown(EMPTY_QUIZ_CONTENT)).toContain('_Empty quiz._')
  })

  it('pads arrays when parsing stored attempts with mismatched lengths', () => {
    const shortAttempt = {
      questions: attempt.questions,
      responses: [[1]], // Only 1 entry for 2 questions
      marks: [1], // Only 1 entry for 2 questions
      feedback: [''], // Only 1 entry for 2 questions
      total: 1,
      max: 3,
      scopeLabel: 'Test',
      takenAt: 1_000_000,
    }
    const parsed = parseAttempt(JSON.stringify(shortAttempt))
    expect(parsed).not.toBeNull()
    expect(parsed?.responses).toHaveLength(2)
    expect(parsed?.marks).toHaveLength(2)
    expect(parsed?.marks?.[1]).toBe(null) // Second mark should be null
    expect(parsed?.feedback).toHaveLength(2)
    expect(parsed?.feedback?.[1]).toBe('')
    // Export should show the second question as ungraded
    const md = quizToExportMarkdown(JSON.stringify(shortAttempt))
    expect(md).toContain('**Marks awarded:** ungraded')
  })
})
