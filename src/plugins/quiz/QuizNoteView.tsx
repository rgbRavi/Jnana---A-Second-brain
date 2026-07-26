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
  // QuizRunner now derives "revealed"/"done" from attempt.marks itself, so a
  // graded attempt stays revealed and locked regardless of the current
  // feedback setting — no override needed here.
  const settings = getQuizSettings()
  return (
    // Read mode is a record of a finished attempt, not a place to take it again.
    // A disabled fieldset cascades to every control inside, so nothing can be
    // clicked or focused — including a blur that would trigger a live re-grade.
    <fieldset disabled style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <QuizRunner
        attempt={attempt}
        settings={settings}
        config={config}
        onChange={() => {
          /* read mode — answers aren't persisted */
        }}
      />
    </fieldset>
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
  // QuizRunner now derives "revealed"/"done" from attempt.marks itself, so a
  // graded attempt stays revealed and locked regardless of the current
  // feedback setting — no override needed here.
  const settings = getQuizSettings()
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
