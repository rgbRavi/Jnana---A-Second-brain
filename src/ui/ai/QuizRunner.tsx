// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/ui/ai/QuizRunner.tsx
//
// The interactive quiz card. Answers live in the QuizAttempt the parent owns
// (it rides the chat thread, so it survives navigation and is saved with the
// conversation) — this component only renders it and reports changes upward.
// Objective questions are graded locally by quizGrade; only descriptive answers
// cost a model call.

import { useState } from 'react'
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
  const [submitted, setSubmitted] = useState(false)

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

  /** True once question `i` is locked (immediate mode after answering, or after submit). */
  const isRevealed = (i: number) => submitted || (settings.feedback === 'immediate' && attempt.marks[i] !== null)

  const setResponse = (i: number, value: number[] | string) => {
    const responses = [...attempt.responses]
    responses[i] = value
    onChange({ ...attempt, responses })
  }

  const gradeOne = async (i: number) => {
    const q = attempt.questions[i]
    const marks = [...attempt.marks]
    const feedback = [...attempt.feedback]

    if (q.format === 'descriptive') {
      setGrading(true)
      const [grade] = await gradeDescriptive(
        [{ question: q.question, reference: q.answer, answer: textOf(attempt, i), marks: q.marks }],
        config,
      )
      setGrading(false)
      marks[i] = grade?.marks ?? null
      feedback[i] = grade?.feedback ?? ''
    } else {
      marks[i] = scoreObjective(q, pickedOf(attempt, i), settings)
    }
    onChange(recomputeTotals({ ...attempt, marks, feedback }))
  }

  const submitAll = async () => {
    const marks = [...attempt.marks]
    const feedback = [...attempt.feedback]

    attempt.questions.forEach((q, i) => {
      if (q.format !== 'descriptive') marks[i] = scoreObjective(q, pickedOf(attempt, i), settings)
    })

    const descriptive: { index: number; item: DescriptiveItem }[] = []
    attempt.questions.forEach((q, i) => {
      if (q.format !== 'descriptive') return
      descriptive.push({
        index: i,
        item: { question: q.question, reference: q.answer, answer: textOf(attempt, i), marks: q.marks },
      })
    })

    if (descriptive.length > 0) {
      setGrading(true)
      const grades = await gradeDescriptive(descriptive.map((d) => d.item), config)
      setGrading(false)
      descriptive.forEach((d, k) => {
        marks[d.index] = grades[k]?.marks ?? null
        feedback[d.index] = grades[k]?.feedback ?? ''
      })
    }

    setSubmitted(true)
    onChange(recomputeTotals({ ...attempt, marks, feedback }))
  }

  const toggleChoice = (i: number, q: QuizQuestion, optionIndex: number) => {
    if (isRevealed(i)) return
    if (q.format === 'mcq') {
      setResponse(i, [optionIndex])
      if (settings.feedback === 'immediate') {
        const responses = [...attempt.responses]
        responses[i] = [optionIndex]
        const marks = [...attempt.marks]
        marks[i] = scoreObjective(q, [optionIndex], settings)
        onChange(recomputeTotals({ ...attempt, responses, marks }))
      }
      return
    }
    const current = pickedOf(attempt, i)
    const next = current.includes(optionIndex)
      ? current.filter((x) => x !== optionIndex)
      : [...current, optionIndex]
    setResponse(i, next)
  }

  const answeredAll = attempt.questions.every((q, i) =>
    q.format === 'descriptive' ? textOf(attempt, i).trim().length > 0 : pickedOf(attempt, i).length > 0,
  )

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
                <textarea
                  className={styles.quizTextarea}
                  value={textOf(attempt, i)}
                  disabled={revealed}
                  placeholder="Your answer…"
                  aria-label={`Answer to question ${i + 1}`}
                  onChange={(e) => setResponse(i, e.target.value)}
                  onBlur={() => {
                    if (settings.feedback === 'immediate' && !revealed && textOf(attempt, i).trim()) void gradeOne(i)
                  }}
                />
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
                        name={`q-${attempt.takenAt}-${i}`}
                        checked={picked.includes(oi)}
                        disabled={revealed}
                        onChange={() => toggleChoice(i, q, oi)}
                      />
                      {opt}
                    </label>
                  )
                })
              )}
            </fieldset>

            {q.format === 'mcma' && !revealed && settings.feedback === 'immediate' && (
              <button className={styles.quizReveal} onClick={() => void gradeOne(i)} disabled={picked.length === 0}>
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
        {settings.feedback === 'end' && !submitted && (
          <button className={styles.btn} onClick={() => void submitAll()} disabled={grading || !answeredAll}>
            {grading ? 'Grading…' : 'Submit answers'}
          </button>
        )}
        {onSave && (submitted || settings.feedback === 'immediate') && (
          <button className={styles.btn} onClick={() => onSave(attempt)}>
            Save quiz
          </button>
        )}
      </div>
    </div>
  )
}
