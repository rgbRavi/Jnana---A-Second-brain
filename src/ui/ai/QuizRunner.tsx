// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/ui/ai/QuizRunner.tsx
//
// The interactive quiz card. Answers live in the QuizAttempt the parent owns
// (it rides the chat thread, so it survives navigation and is saved with the
// conversation) — this component only renders it and reports changes upward.
// Objective questions are graded locally by quizGrade; only descriptive answers
// cost a model call.

import { useId, useRef, useState } from 'react'
import type { AiConfig, QuizAttempt, QuizQuestion, QuizSettings } from '../../types'
import { gradeDescriptive, recomputeTotals, scoreObjective, type DescriptiveItem } from '../../core/ai/quizGrade'
import styles from './Ai.module.css'

interface Props {
  attempt: QuizAttempt
  settings: QuizSettings
  config: AiConfig
  reason?: 'empty-index' | 'empty-scope'
  onChange: (next: QuizAttempt) => void
  onIndexNow?: () => void
  onSave?: (attempt: QuizAttempt) => void
}

const pickedOf = (attempt: QuizAttempt, i: number): number[] => {
  const r = attempt.responses[i]
  return Array.isArray(r) ? r : []
}

const textOf = (attempt: QuizAttempt, i: number): string => {
  const r = attempt.responses[i]
  return typeof r === 'string' ? r : ''
}

export function QuizRunner({ attempt, settings, config, reason, onChange, onIndexNow, onSave }: Props) {
  const [grading, setGrading] = useState(false)
  const [gradingIndex, setGradingIndex] = useState<number | null>(null)
  const formId = useId()

  // Async grading (gradeDescriptive) can land after the user has already edited
  // another answer or after another grade has come back — merging onto the
  // closed-over `attempt` prop would silently revert that work. Always merge
  // onto the latest attempt via this ref, never onto a pre-await snapshot.
  const attemptRef = useRef(attempt)
  attemptRef.current = attempt

  const commitAttempt = (next: QuizAttempt) => {
    attemptRef.current = next
    onChange(next)
  }

  if (attempt.questions.length === 0) {
    return (
      <div className={styles.analysisCard}>
        {reason === 'empty-index' ? (
          <>
            <p className={styles.hint}>
              Nothing indexed matched that topic. Index this vault's notes, or switch the quiz's
              notes source to “Scoped notes”.
            </p>
            {onIndexNow && (
              <button className={styles.btn} onClick={onIndexNow}>
                Index now
              </button>
            )}
          </>
        ) : (
          <p className={styles.hint}>Not enough in these notes to build a quiz.</p>
        )}
      </div>
    )
  }

  // The attempt (not local state) is the source of truth for whether this quiz
  // is "done" — it rides the chat thread and survives remount, so a graded
  // quiz reopened after navigation must not revert to a live, re-gradable form.
  const anyGraded = attempt.marks.some((m) => m !== null)
  const done = settings.feedback === 'end' && anyGraded
  /** True once question `i` is locked (graded already, or the whole quiz is done). */
  const isRevealed = (i: number) => done || attempt.marks[i] !== null
  const isResponseLocked = (i: number) => isRevealed(i) || (settings.feedback === 'end' && grading)

  const setResponse = (i: number, value: number[] | string) => {
    const current = attemptRef.current
    const responses = [...current.responses]
    responses[i] = value
    commitAttempt({ ...current, responses })
  }

  const gradeOne = async (i: number) => {
    const q = attemptRef.current.questions[i]

    if (q.format === 'descriptive') {
      const answerText = textOf(attemptRef.current, i)
      setGradingIndex(i)
      try {
        const [grade] = await gradeDescriptive(
          [{ question: q.question, reference: q.answer, answer: answerText, marks: q.marks }],
          config,
        )
        const marks = [...attemptRef.current.marks]
        const feedback = [...attemptRef.current.feedback]
        marks[i] = grade?.marks ?? null
        feedback[i] = grade?.feedback ?? ''
        commitAttempt(recomputeTotals({ ...attemptRef.current, marks, feedback }))
      } finally {
        setGradingIndex(null)
      }
      return
    }

    const marks = [...attemptRef.current.marks]
    const feedback = [...attemptRef.current.feedback]
    marks[i] = scoreObjective(q, pickedOf(attemptRef.current, i), settings)
    commitAttempt(recomputeTotals({ ...attemptRef.current, marks, feedback }))
  }

  const submitAll = async () => {
    // slow) grading round-trip — not after it resolves.
    const base = attemptRef.current

    const objective = new Map<number, number>()
    base.questions.forEach((q, i) => {
      if (q.format !== 'descriptive') objective.set(i, scoreObjective(q, pickedOf(base, i), settings))
    })

    const descriptive: { index: number; item: DescriptiveItem }[] = []
    base.questions.forEach((q, i) => {
      if (q.format !== 'descriptive') return
      descriptive.push({
        index: i,
        item: { question: q.question, reference: q.answer, answer: textOf(base, i), marks: q.marks },
      })
    })

    if (objective.size > 0) {
      const marks = [...base.marks]
      const feedback = [...base.feedback]
      objective.forEach((m, i) => {
        marks[i] = m
      })
      commitAttempt(recomputeTotals({ ...base, marks, feedback }))
    }

    if (descriptive.length === 0) return

    setGrading(true)
    try {
      const grades = await gradeDescriptive(descriptive.map((d) => d.item), config)
      const marks = [...attemptRef.current.marks]
      const feedback = [...attemptRef.current.feedback]
      descriptive.forEach((d, k) => {
        marks[d.index] = grades[k]?.marks ?? null
        feedback[d.index] = grades[k]?.feedback ?? ''
      })
      commitAttempt(recomputeTotals({ ...attemptRef.current, marks, feedback }))
    } finally {
      setGrading(false)
    }
  }

  const toggleChoice = (i: number, q: QuizQuestion, optionIndex: number) => {
    if (isResponseLocked(i)) return
    const currentAttempt = attemptRef.current
    if (q.format === 'mcq') {
      const responses = [...currentAttempt.responses]
      responses[i] = [optionIndex]
      if (settings.feedback === 'immediate') {
        const marks = [...currentAttempt.marks]
        marks[i] = scoreObjective(q, [optionIndex], settings)
        commitAttempt(recomputeTotals({ ...currentAttempt, responses, marks }))
      } else {
        commitAttempt({ ...currentAttempt, responses })
      }
      return
    }
    const current = pickedOf(currentAttempt, i)
    const next = current.includes(optionIndex)
      ? current.filter((x) => x !== optionIndex)
      : [...current, optionIndex]
    setResponse(i, next)
  }

  // Score every unanswered OBJECTIVE question as a real 0 before handing the
  // attempt off to be saved — recomputeTotals excludes null marks from both
  // total and max, so a skipped objective question must not shrink the
  // denominator (that would raise the percentage for skipping). A null
  // descriptive mark stays null: that's a grader failure, not a skip.
  const finalize = (a: QuizAttempt): QuizAttempt =>
    recomputeTotals({
      ...a,
      marks: a.marks.map((m, i) =>
        m === null && a.questions[i].format !== 'descriptive'
          ? scoreObjective(a.questions[i], pickedOf(a, i), settings)
          : m,
      ),
    })
  const canSave = Boolean(onSave && !grading && gradingIndex === null && (done || settings.feedback === 'immediate'))

  return (
    <div className={styles.analysisCard}>
      <div className={styles.quizScore}>
        <span className={styles.sectionTitle}>Quiz · {attempt.questions.length} questions</span>
        <span className={styles.quizScoreValue}>
          {attempt.max > 0 ? `${attempt.total} / ${attempt.max}` : `0 / ${attempt.questions.reduce((s, q) => s + q.marks, 0)}`}
        </span>
      </div>

      {attempt.questions.map((q, i) => {
        const revealed = isRevealed(i)
        const locked = isResponseLocked(i)
        const picked = pickedOf(attempt, i)
        const correct = q.correct ?? []
        return (
          <div key={i} className={styles.quizItem}>
            <fieldset className={styles.quizOptions}>
              <legend className={styles.quizQ}>
                <span className={styles.quizKind}>{q.format === 'descriptive' ? q.kind : q.format}</span>
                {i + 1}. {q.question} <span className={styles.quizExpl}>({q.marks} marks)</span>
              </legend>

              {q.format === 'descriptive' ? (
                <>
                  <textarea
                    className={styles.quizTextarea}
                    value={textOf(attempt, i)}
                    disabled={locked || gradingIndex === i}
                    placeholder="Your answer…"
                    aria-label={`Answer to question ${i + 1}`}
                    onChange={(e) => setResponse(i, e.target.value)}
                    onBlur={() => {
                      if (
                        settings.feedback === 'immediate' &&
                        !revealed &&
                        !locked &&
                        gradingIndex === null &&
                        textOf(attempt, i).trim()
                      )
                        void gradeOne(i)
                    }}
                  />
                  {gradingIndex === i && <span className={styles.hint}>Grading…</span>}
                </>
              ) : (
                (q.options ?? []).map((opt, oi) => {
                  const state = !revealed
                    ? ''
                    : correct.includes(oi)
                      ? styles.quizOptionCorrect
                      : picked.includes(oi)
                        ? styles.quizOptionWrong
                        : ''
                  return (
                    <label key={oi} className={`${styles.quizOption} ${state}`}>
                      <input
                        type={q.format === 'mcq' ? 'radio' : 'checkbox'}
                        name={`${formId}-q-${i}`}
                        checked={picked.includes(oi)}
                        disabled={locked}
                        onChange={() => toggleChoice(i, q, oi)}
                      />
                      {opt}
                    </label>
                  )
                })
              )}
            </fieldset>

            {q.format === 'mcma' && !revealed && settings.feedback === 'immediate' && (
              <button className={styles.quizReveal} onClick={() => void gradeOne(i)} disabled={picked.length === 0 || gradingIndex === i}>
                Check answer
              </button>
            )}

            {revealed && (
              <div className={styles.quizAnswer} aria-live="polite">
                <p className={styles.quizA}>{q.answer}</p>
                {q.explanation && <p className={styles.quizExpl}>{q.explanation}</p>}
                <p className={styles.quizMarkLine}>
                  {attempt.marks[i] === null ? 'Ungraded' : `${attempt.marks[i]} / ${q.marks} marks`}
                  {attempt.feedback[i] ? ` — ${attempt.feedback[i]}` : ''}
                </p>
              </div>
            )}
          </div>
        )
      })}

      <div className={styles.quizActions}>
        {settings.feedback === 'end' && !done && (
          <button className={styles.btn} onClick={() => void submitAll()} disabled={grading}>
            {grading ? 'Grading…' : 'Submit answers'}
          </button>
        )}
        {canSave && onSave && (
          <button className={styles.btn} onClick={() => onSave(finalize(attempt))}>
            Save quiz
          </button>
        )}
      </div>
    </div>
  )
}
