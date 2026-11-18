// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AiConfig, QuizAttempt, QuizQuestion, QuizSettings } from '../../types'
import { emptyAttempt } from '../../core/ai/quizGrade'
const { recheckQuestion, gradeDescriptive, toastError } = vi.hoisted(() => ({
  recheckQuestion: vi.fn(),
  gradeDescriptive: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('../../core/ai/quizRecheck', () => ({ recheckQuestion }))
vi.mock('../../core/ai/quizGrade', async (orig) => ({
  ...(await orig<typeof import('../../core/ai/quizGrade')>()),
  gradeDescriptive,
}))
vi.mock('../../lib/toast', () => ({ toast: { error: toastError, success: vi.fn(), info: vi.fn() } }))

import { QuizRunner } from './QuizRunner'

const config: AiConfig = {
  enabled: false,
  autoIndex: true,
  chatProvider: 'ollama',
  chatBaseUrl: 'http://localhost:11434',
  chatApiKey: '',
  chatModel: 'llama3.1',
  embeddingProvider: 'ollama',
  embeddingBaseUrl: 'http://localhost:11434',
  embeddingApiKey: '',
  embeddingModel: 'nomic-embed-text',
  transcriptionProvider: 'openai',
  transcriptionBaseUrl: 'https://api.openai.com/v1',
  transcriptionApiKey: '',
  transcriptionModel: 'whisper-1',
  transcribeOnRecord: false,
  deepResearchProvider: 'openai',
  deepResearchBaseUrl: 'https://api.openai.com/v1',
  deepResearchApiKey: '',
  deepResearchModel: '',
  webSearchProvider: 'brave',
  webSearchBaseUrl: '',
  webSearchApiKey: '',
  chatSystemPrompt: '',
  globalSystemPrompt: '',
  activePresets: {},
  presets: { chat: [], embedding: [], transcription: [], deepResearch: [], webSearch: [] },
}

const question: QuizQuestion = {
  kind: 'recall',
  format: 'mcq',
  question: 'Which option is correct?',
  options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  correct: [1],
  answer: 'Beta is correct.',
  explanation: 'The notes identify Beta as the answer.',
  marks: 1,
}

const baseSettings: QuizSettings = {
  count: 1,
  formats: { mcq: true, mcma: true, descriptive: true },
  weights: { mcq: 1, mcma: 1, descriptive: 1 },
  negativeMarking: false,
  negativeFraction: 0.25,
  mcmaRule: 'partial',
  feedback: 'end',
  source: 'raw',
  difficulty: 'mix',
  verify: true,
}

function Harness({ initial, settings }: { initial: QuizAttempt; settings: QuizSettings }) {
  const [attempt, setAttempt] = useState(initial)
  return (
    <>
      <QuizRunner attempt={attempt} settings={settings} config={config} onChange={setAttempt} />
      <output data-testid="attempt">{JSON.stringify(attempt)}</output>
    </>
  )
}

describe('QuizRunner', () => {
  it('lets the user pick an MCQ answer before end-of-quiz grading', () => {
    render(<Harness initial={emptyAttempt([question], 'Scope')} settings={baseSettings} />)

    const beta = screen.getByLabelText('Beta') as HTMLInputElement
    fireEvent.click(beta)

    expect(beta).toBeChecked()
    expect(screen.queryByText('Beta is correct.')).toBeNull()
    expect(JSON.parse(screen.getByTestId('attempt').textContent ?? '{}').responses).toEqual([[1]])
  })

  it('grades selected objective answers on submit and reveals the result', () => {
    render(<Harness initial={emptyAttempt([question], 'Scope')} settings={baseSettings} />)

    fireEvent.click(screen.getByLabelText('Beta'))
    fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }))

    expect(screen.getByText('Beta is correct.')).toBeInTheDocument()
    expect(screen.getByText('1 / 1 mark')).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('attempt').textContent ?? '{}').marks).toEqual([1])
  })

  it('grades MCQs immediately when immediate feedback is enabled', () => {
    render(
      <Harness
        initial={emptyAttempt([question], 'Scope')}
        settings={{ ...baseSettings, feedback: 'immediate' }}
      />,
    )

    fireEvent.click(screen.getByLabelText('Beta'))

    expect(screen.getByText('Beta is correct.')).toBeInTheDocument()
    expect(screen.getByText('1 / 1 mark')).toBeInTheDocument()
  })

  it('marks under the scoring frozen into the attempt, not the current settings', () => {
    const frozen = { negativeMarking: true, negativeFraction: 0.5, mcmaRule: 'partial' as const, feedback: 'immediate' as const }
    render(<Harness initial={emptyAttempt([question], 'Scope', frozen)} settings={baseSettings} />)

    // Current settings say end-of-quiz + no penalty; the attempt says immediate + half off.
    fireEvent.click(screen.getByLabelText('Alpha'))

    expect(screen.getByText('-0.5 / 1 mark')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit answers' })).toBeNull()
  })

  const immediate = { ...baseSettings, feedback: 'immediate' as const }
  const attemptOf = () => JSON.parse(screen.getByTestId('attempt').textContent ?? '{}')

  it('disputing removes the question from the score and undo restores it', () => {
    render(<Harness initial={emptyAttempt([question], 'Scope')} settings={immediate} />)
    fireEvent.click(screen.getByLabelText('Beta'))
    expect(screen.getByText('1 / 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'This answer is wrong' }))
    expect(screen.getByText('0 / 0')).toBeInTheDocument()
    expect(attemptOf().disputed).toEqual([true])
    expect(screen.getByText('Disputed — not counted')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(attemptOf().disputed).toEqual([false])
  })

  it('shows "Answers not checked" when verified is failed', () => {
    render(<Harness initial={{ ...emptyAttempt([question], 'Scope'), origin: 'web', verified: 'failed' }} settings={baseSettings} />)
    expect(screen.getByText('Answers not checked — the check failed')).toBeInTheDocument()
  })

  it('shows the web badge with page count', () => {
    const a = { ...emptyAttempt([question], 'Scope'), origin: 'web' as const, sources: [{ url: 'https://a.test', title: 'A' }, { url: 'https://b.test', title: 'B' }], failedPages: 1 }
    render(<Harness initial={a} settings={baseSettings} />)
    expect(screen.getByText(/From the web · 2 pages · couldn't read 1/)).toBeInTheDocument()
  })

  it('separates the no-search note and uses singulars', () => {
    const a = { ...emptyAttempt([question], 'Scope'), origin: 'web' as const, sources: [{ url: 'https://a.test', title: 'A' }], failedPages: 1, dropped: 1 }
    render(<Harness initial={a} settings={baseSettings} />)
    expect(
      screen.getByText("From the web · 1 page · couldn't read 1 page · Web search isn't set up — only your links were used."),
    ).toBeInTheDocument()
    expect(screen.getByText('Quiz · 1 question')).toBeInTheDocument()
    expect(screen.getByText("1 question dropped — its answer couldn't be supported")).toBeInTheDocument()
    expect(screen.getByText('(1 mark)')).toBeInTheDocument()
  })

  it('words the empty state by where the quiz came from', () => {
    const empty = (origin?: 'web' | 'ai', reason?: 'off-topic') =>
      render(
        <QuizRunner attempt={emptyAttempt([], 'Scope', undefined, origin ? { origin } : undefined)} settings={baseSettings} config={config} reason={reason} onChange={() => {}} />,
      )
    empty('web')
    expect(screen.getByText('Not enough on those pages to build a quiz.')).toBeInTheDocument()
    empty('ai')
    expect(screen.getByText('Not enough known about that topic to build a quiz.')).toBeInTheDocument()
    empty()
    expect(screen.getByText('Not enough in these notes to build a quiz.')).toBeInTheDocument()
    empty(undefined, 'off-topic')
    expect(screen.getByText(/Try the Web or AI knowledge source to quiz on it\./)).toBeInTheDocument()
    expect(screen.queryByText(/built only from this vault's notes/)).toBeNull()
  })

  it('shows the AI-knowledge label', () => {
    render(<Harness initial={{ ...emptyAttempt([question], 'Scope'), origin: 'ai' }} settings={baseSettings} />)
    expect(screen.getByText(/From the AI's general knowledge — not checked against a source/)).toBeInTheDocument()
  })

  it('renders the no-search empty state', () => {
    render(
      <QuizRunner attempt={emptyAttempt([], 'Scope')} settings={baseSettings} config={config} reason="no-search" onChange={() => {}} />,
    )
    expect(screen.getByText('Add a web search provider in Settings → AI setup, or paste links.')).toBeInTheDocument()
  })

  it("finalize leaves a disputed unanswered question's mark null", () => {
    const q2 = { ...question, question: 'Second?' }
    const saved: QuizAttempt[] = []
    const a: QuizAttempt = { ...emptyAttempt([question, q2], 'Scope'), marks: [1, null], disputed: [false, true], total: 1, max: 1 }
    render(
      <QuizRunner attempt={a} settings={immediate} config={config} onChange={() => {}} onSave={(x) => saved.push(x)} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save quiz' }))
    expect(saved[0].marks).toEqual([1, null])
    expect(saved[0].max).toBe(1)
  })

  it('a corrected recheck re-scores the existing answer', async () => {
    const src = { url: 'https://a.test', title: 'A', quote: 'Gamma is the answer here' }
    const q = { ...question, source: src }
    const a: QuizAttempt = { ...emptyAttempt([q], 'Scope'), origin: 'web', responses: [[2]], marks: [0], disputed: [true], total: 0, max: 0 }
    recheckQuestion.mockResolvedValue({
      kind: 'corrected',
      question: { ...q, correct: [2], answer: 'Gamma', corrected: true },
      evidence: src,
    })
    render(<Harness initial={a} settings={{ ...baseSettings, feedback: 'immediate' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recheck on the web' }))
    expect(await screen.findByText('Corrected after recheck')).toBeInTheDocument()
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('attempt').textContent ?? '{}').disputed).toEqual([false])
  })

  it('says so when a corrected written answer cannot be re-graded', async () => {
    const src = { url: 'https://a.test', title: 'A', quote: 'The answer is Gamma, really' }
    const d: QuizQuestion = { kind: 'recall', format: 'descriptive', question: 'Why?', answer: 'Beta', explanation: '', marks: 1, source: src }
    const a: QuizAttempt = { ...emptyAttempt([d], 'Scope'), origin: 'web', responses: ['Gamma'], marks: [0], disputed: [true], total: 0, max: 0 }
    recheckQuestion.mockResolvedValue({ kind: 'corrected', question: { ...d, answer: 'Gamma', source: src, corrected: true }, evidence: src })
    gradeDescriptive.mockResolvedValue([{ marks: null, feedback: '' }])
    render(<Harness initial={a} settings={{ ...baseSettings, feedback: 'immediate' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recheck on the web' }))
    await waitFor(() => expect(JSON.parse(screen.getByTestId('attempt').textContent ?? '{}').questions[0].corrected).toBe(true))
    expect(toastError).toHaveBeenCalledWith("Corrected, but couldn't re-grade your answer. Check AI settings and try again.")
  })

  it('undoing a dispute clears its stale recheck result', () => {
    const a: QuizAttempt = {
      ...emptyAttempt([question], 'Scope'), origin: 'web', marks: [0], disputed: [true], rechecks: [{ outcome: 'unclear', reason: 'x' }],
    }
    render(<Harness initial={a} settings={baseSettings} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(JSON.parse(screen.getByTestId('attempt').textContent ?? '{}').rechecks).toEqual([null])
  })

  it('notes quizzes have no recheck button', () => {
    const a: QuizAttempt = { ...emptyAttempt([question], 'Scope'), marks: [0], disputed: [true] }
    render(<Harness initial={a} settings={baseSettings} />)
    expect(screen.queryByRole('button', { name: 'Recheck on the web' })).toBeNull()
  })

  it('disables recheck without web search or a source', () => {
    const a: QuizAttempt = { ...emptyAttempt([question], 'Scope'), origin: 'ai', marks: [0], disputed: [true] }
    render(<Harness initial={a} settings={baseSettings} />)
    expect(screen.getByRole('button', { name: 'Recheck on the web' })).toBeDisabled()
  })
})
