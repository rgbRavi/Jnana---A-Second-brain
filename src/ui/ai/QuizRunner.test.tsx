// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { AiConfig, QuizAttempt, QuizQuestion, QuizSettings } from '../../types'
import { emptyAttempt } from '../../core/ai/quizGrade'
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
  showToolbar: true,
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
    expect(screen.getByText('1 / 1 marks')).toBeInTheDocument()
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
    expect(screen.getByText('1 / 1 marks')).toBeInTheDocument()
  })
})
