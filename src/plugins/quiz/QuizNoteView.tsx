// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// One component serving both the read and edit slots of the quiz note type:
// a saved quiz is the same card you took it in, plus Retake. The Editor slot
// writes the reworked attempt straight back into note.content.

import type { NoteEditorProps, NoteViewProps } from '../../lib/noteTypes'
import type { AiConfig, QuizAttempt } from '../../types'
import { QuizRunner } from '../../ui/ai/QuizRunner'
import { emptyAttempt } from '../../core/ai/quizGrade'
import { getQuizSettings } from '../../hooks/useQuizSettings'
import { loadAiConfig } from '../../core/ai/config'
import { showConfirmDialog } from '../../lib/dialog'
import { log } from '../../lib/logger'
import { useEffect, useState } from 'react'
import { parseAttempt, serializeAttempt } from './quizNote'
import styles from './QuizNote.module.css'

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

/**
 * Read mode: the saved attempt, inert by default. Read mode has no `onChange`,
 * so a retake here can only ever be a practice run — it lives in component
 * state and is thrown away. The banner says so, because a quiz you answered
 * and then lost is worse than one you couldn't answer at all.
 */
export function QuizNoteView({ note }: NoteViewProps) {
  const attempt = parseAttempt(note.content)
  const { config, failed } = useAiConfig()
  const [practice, setPractice] = useState<QuizAttempt | null>(null)
  if (!attempt) return <p>Not a readable quiz.</p>
  if (attempt.questions.length === 0) return <p>Take a quiz in AI chat, then save it here.</p>
  if (failed) return <p>AI settings could not be loaded.</p>
  if (!config) return <p>Loading…</p>
  // QuizRunner now derives "revealed"/"done" from attempt.marks itself, so a
  // graded attempt stays revealed and locked regardless of the current
  // feedback setting — no override needed here.
  const settings = getQuizSettings()

  if (practice) {
    return (
      <>
        <div className={styles.bar}>
          <span className={styles.practiceNote}>
            Practice run — these answers are <strong>not saved</strong>. Switch to edit mode to
            record a new attempt.
          </span>
          <button className={styles.retakeBtn} onClick={() => setPractice(null)}>
            Show saved result
          </button>
        </div>
        <QuizRunner
          attempt={practice}
          settings={settings}
          config={config}
          onChange={setPractice}
        />
      </>
    )
  }

  return (
    <>
      <div className={styles.bar}>
        <span className={styles.hint}>Switch to edit mode to retake and keep your answers.</span>
        <button
          className={styles.retakeBtn}
          title="Answer again without saving"
          onClick={() => setPractice(emptyAttempt(attempt.questions, attempt.scopeLabel))}
        >
          Practice retake
        </button>
      </div>
      {/* The saved record is not a place to take the quiz again: a disabled
          fieldset cascades to every control inside, so nothing can be clicked
          or focused — including a blur that would trigger a live re-grade. */}
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
    </>
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
  const graded = attempt.marks.some((m) => m !== null)
  return (
    <div className={styles.scroll}>
      <div className={styles.bar}>
        <span className={styles.hint}>
          {graded ? 'Answers are saved as you go.' : 'A fresh attempt — answers save as you go.'}
        </span>
        <button
          className={styles.retakeBtn}
          title="Clear your answers and start this quiz again"
          onClick={() => {
            void (async () => {
              // Retaking overwrites a graded attempt in place — confirm first,
              // the same as any other irreversible action in the app.
              if (
                graded &&
                !(await showConfirmDialog({
                  title: 'Retake this quiz?',
                  message: 'Your saved answers and score for this attempt will be replaced.',
                  confirmLabel: 'Retake',
                  danger: true,
                }))
              ) {
                return
              }
              onChange(serializeAttempt(emptyAttempt(attempt.questions, attempt.scopeLabel)))
            })()
          }}
        >
          Retake
        </button>
      </div>
      <QuizRunner
        attempt={attempt}
        settings={settings}
        config={config}
        onChange={(next) => onChange(serializeAttempt(next))}
      />
    </div>
  )
}
