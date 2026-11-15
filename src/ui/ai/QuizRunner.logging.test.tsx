// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('../../lib/toast', () => toast)
vi.mock('../../core/ai/quizGrade', async (orig) => ({
  ...(await orig<typeof import('../../core/ai/quizGrade')>()),
  gradeDescriptive: vi.fn(() => Promise.reject(new Error('provider 401'))),
}))

import type { AiConfig, QuizAttempt, QuizSettings } from '../../types'
import { emptyAttempt } from '../../core/ai/quizGrade'
import { QuizRunner } from './QuizRunner'

const settings = {
  count: 1,
  formats: { mcq: true, mcma: true, descriptive: true },
  weights: { mcq: 1, mcma: 1, descriptive: 1 },
  negativeMarking: false,
  negativeFraction: 0.25,
  mcmaRule: 'partial',
  feedback: 'end',
  source: 'raw',
  difficulty: 'mix',
} as QuizSettings

const descriptive = emptyAttempt(
  [{ kind: 'recall', format: 'descriptive', question: 'Explain X', answer: 'X is Y', marks: 2 }] as QuizAttempt['questions'],
  'Scope',
)

function Harness({ log }: { log: Parameters<typeof QuizRunner>[0]['log'] }) {
  const [attempt, setAttempt] = useState(descriptive)
  return <QuizRunner attempt={attempt} settings={settings} config={{} as AiConfig} onChange={setAttempt} log={log} />
}

describe('QuizRunner grading failure', () => {
  it('tells the user and logs through the given logger instead of rejecting silently', async () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    render(<Harness log={log} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my answer' } })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(log.error).toHaveBeenCalledWith('Grading failed', expect.any(Error)))
    expect(toast.toast.error).toHaveBeenCalledWith(expect.stringContaining("Couldn't grade"))
    expect(log.info).not.toHaveBeenCalled() // not completed
  })
})
