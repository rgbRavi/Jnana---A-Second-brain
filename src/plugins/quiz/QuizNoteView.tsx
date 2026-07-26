// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// One component serving both the read and edit slots of the quiz note type:
// a saved quiz is the same card you took it in, plus Retake. The Editor slot
// writes the reworked attempt straight back into note.content.

import type { NoteEditorProps, NoteViewProps } from '../../lib/noteTypes'
import type { AiConfig } from '../../types'
import { QuizRunner } from '../../ui/ai/QuizRunner'
import { emptyAttempt } from '../../core/ai/quizGrade'
import { getQuizSettings } from '../../hooks/useQuizSettings'
import { loadAiConfig } from '../../core/ai/config'
import { log } from '../../lib/logger'
import { useEffect, useState } from 'react'
import { parseAttempt, serializeAttempt } from './quizNote'

function useAiConfig(): { config: AiConfig | null; failed: boolean } {
  const [state, setState] = useState<{ config: AiConfig | null; failed: boolean }>({
    config: null,
    failed: false,
  })
  useEffect(() => {
    let cancelled = false
    void loadAiConfig()
      .then((config) => {
        if (!cancelled) setState({ config, failed: false })
      })
      .catch((err) => {
        if (!cancelled) {
          log.error('Failed to load AI config', err)
          setState({ config: null, failed: true })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

/** Read mode: the finished attempt, non-editable (no onChange target). */
export function QuizNoteView({ note }: NoteViewProps) {
  const attempt = parseAttempt(note.content)
  const { config, failed } = useAiConfig()
  if (!attempt) return <p>Not a readable quiz.</p>
  if (attempt.questions.length === 0) return <p>Take a quiz in AI chat, then save it here.</p>
  if (failed) return <p>AI settings could not be loaded.</p>
  if (!config) return <p>Loading…</p>
  // When a quiz is already graded, force immediate feedback mode so each question's
  // reveal is keyed off its own marks[i], preventing re-grading on submit.
  const graded = attempt.marks.some((m) => m !== null)
  const settings = graded ? { ...getQuizSettings(), feedback: 'immediate' as const } : getQuizSettings()
  return (
    <QuizRunner
      attempt={attempt}
      settings={settings}
      config={config}
      onChange={() => {
        /* read mode — answers aren't persisted */
      }}
    />
  )
}

/** Edit mode: same card, with Retake, writing back through onChange. */
export function QuizNoteEditor({ value, onChange }: NoteEditorProps) {
  const attempt = parseAttempt(value)
  const { config, failed } = useAiConfig()
  if (!attempt) return <p>Not a readable quiz.</p>
  if (attempt.questions.length === 0) return <p>Take a quiz in AI chat, then save it here.</p>
  if (failed) return <p>AI settings could not be loaded.</p>
  if (!config) return <p>Loading…</p>
  // When a quiz is already graded, force immediate feedback mode so each question's
  // reveal is keyed off its own marks[i], preventing re-grading on submit.
  const graded = attempt.marks.some((m) => m !== null)
  const settings = graded ? { ...getQuizSettings(), feedback: 'immediate' as const } : getQuizSettings()
  return (
    <>
      <button
        onClick={() => onChange(serializeAttempt(emptyAttempt(attempt.questions, attempt.scopeLabel)))}
      >
        Retake
      </button>
      <QuizRunner
        attempt={attempt}
        settings={settings}
        config={config}
        onChange={(next) => onChange(serializeAttempt(next))}
      />
    </>
  )
}
