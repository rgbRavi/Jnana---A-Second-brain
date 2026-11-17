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
import type { AiConfig, QuizAttempt, QuizEmptyReason, QuizQuestion, QuizSettings } from '../../types'
import {
  effectiveSettings,
  gradeDescriptive,
  isDisputed,
  recomputeTotals,
  scoreObjective,
  type DescriptiveItem,
} from '../../core/ai/quizGrade'
import { recheckQuestion } from '../../core/ai/quizRecheck'
import { openBucket, addNeverAsk, removeNeverAsk } from '../../core/ai/quizMemory'
import { openWebPage } from '../../core/ai/web'
import { hasWebSearch } from '../../core/ai/config'
import { eventBus } from '../../lib/eventBus'
import { toast } from '../../lib/toast'
import { scopedLog, type ScopedLog } from '../../lib/logger'
import styles from './Ai.module.css'

interface Props {
  attempt: QuizAttempt
  settings: QuizSettings
  config: AiConfig
  reason?: QuizEmptyReason
  onChange: (next: QuizAttempt) => void
  onIndexNow?: () => void
  onSave?: (attempt: QuizAttempt) => void
  /** Vault for the never-ask list; without it disputes still score but aren't remembered. */
  vaultId?: string
  /** Where grading failures and completions are logged — the quiz plugin passes its
   *  `ctx.log`; AI chat uses the app's `ai` category. */
  log?: ScopedLog
}

const QUIZ_LOG = scopedLog('ai')

const pickedOf = (attempt: QuizAttempt, i: number): number[] => {
  const r = attempt.responses[i]
  return Array.isArray(r) ? r : []
}

const textOf = (attempt: QuizAttempt, i: number): string => {
  const r = attempt.responses[i]
  return typeof r === 'string' ? r : ''
}

const EMPTY_COPY: Partial<Record<QuizEmptyReason, string>> = {
  'nothing-verified': "Your sources didn't support any answerable questions.",
  'no-pages': 'None of those pages could be read.',
  'no-search': 'Add a web search provider in Settings → AI setup, or paste links.',
  'unknown-topic': "The AI doesn't know enough about that topic to quiz you on it.",
}

/** "1 page" / "2 pages". */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The no-reason empty state, worded for where the quiz came from. */
const EMPTY_FALLBACK = {
  web: 'Not enough on those pages to build a quiz.',
  ai: 'Not enough known about that topic to build a quiz.',
  notes: 'Not enough in these notes to build a quiz.',
}

const isComplete = (a: QuizAttempt) => a.marks.length > 0 && a.marks.every((m) => m !== null)

export function QuizRunner({ attempt, settings: current, config, reason, onChange, onIndexNow, onSave, vaultId, log = QUIZ_LOG }: Props) {
  // Mark under the scoring frozen into the attempt, so editing the settings later
  // can't re-mark (or unlock) a quiz already in progress or saved.
  const settings = effectiveSettings(attempt, current)
  const [grading, setGrading] = useState(false)
  const [gradingIndex, setGradingIndex] = useState<number | null>(null)
  const [rechecking, setRechecking] = useState<number | null>(null)
  const formId = useId()

  // Async grading (gradeDescriptive) can land after the user has already edited
  // another answer or after another grade has come back — merging onto the
  // closed-over `attempt` prop would silently revert that work. Always merge
  // onto the latest attempt via this ref, never onto a pre-await snapshot.
  const attemptRef = useRef(attempt)
  attemptRef.current = attempt

  const commitAttempt = (next: QuizAttempt) => {
    const wasComplete = isComplete(attemptRef.current)
    attemptRef.current = next
    onChange(next)
    // The one moment every question has a mark — announced once, as it happens
    // (a finished quiz reopened later doesn't re-announce).
    if (!wasComplete && isComplete(next)) {
      eventBus.emit('quiz:completed', { total: next.total, max: next.max })
      log.info('Quiz completed', { total: next.total, max: next.max, questions: next.questions.length })
    }
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
        ) : reason === 'off-topic' ? (
          <p className={styles.hint}>
            Your notes don't cover that topic, so there's nothing to quiz you on. Try the Web or AI
            knowledge source to quiz on it.
          </p>
        ) : reason && EMPTY_COPY[reason] ? (
          <p className={styles.hint}>{EMPTY_COPY[reason]}</p>
        ) : (
          <p className={styles.hint}>{EMPTY_FALLBACK[attempt.origin ?? 'notes']}</p>
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
      } catch (err) {
        // Was an unhandled rejection: the spinner stopped and nothing said why.
        toast.error("Couldn't grade that answer. Check AI settings and try again.")
        log.error('Grading failed', err)
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
    // Snapshot the attempt at click time, before the (possibly slow) grading
    // round-trip — not after it resolves.
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
    } catch (err) {
      toast.error("Couldn't grade the written answers. Check AI settings and try again.")
      log.error('Grading failed', err)
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
        m === null && a.questions[i].format !== 'descriptive' && !isDisputed(a, i)
          ? scoreObjective(a.questions[i], pickedOf(a, i), settings)
          : m,
      ),
    })
  // Disputing (or undoing) goes through commitAttempt so it persists at once; the
  // question also joins/leaves the never-ask list so it isn't served again.
  const setDisputed = (i: number, on: boolean) => {
    const cur = attemptRef.current
    const disputed = cur.questions.map((_, k) => (k === i ? on : isDisputed(cur, k)))
    // A recheck result belongs to the dispute it answered — undoing it clears that.
    const rechecks = cur.rechecks && !on ? cur.rechecks.map((r, k) => (k === i ? null : r)) : cur.rechecks
    commitAttempt(recomputeTotals({ ...cur, disputed, ...(rechecks ? { rechecks } : {}) }))
    if (!vaultId) return
    const bucket = cur.origin && cur.origin !== 'notes' ? openBucket(vaultId) : vaultId
    ;(on ? addNeverAsk : removeNeverAsk)(bucket, cur.questions[i].question)
  }
  // Recheck a dispute on the web. Merges onto the latest attempt after the awaits,
  // since the user may have changed other answers meanwhile.
  const recheck = async (i: number) => {
    if (rechecking !== null) return
    setRechecking(i)
    try {
      const q = attemptRef.current.questions[i]
      const out = await recheckQuestion(q, config)
      let grade: { marks: number | null; feedback: string } | undefined
      if (out.kind === 'corrected' && out.question.format === 'descriptive') {
        ;[grade] = await gradeDescriptive(
          [{ question: out.question.question, reference: out.question.answer, answer: textOf(attemptRef.current, i), marks: out.question.marks }],
          config,
        ).catch((err) => {
          log.error('Re-grading after recheck failed', err)
          return []
        })
        if (grade?.marks == null) toast.error("Corrected, but couldn't re-grade your answer. Check AI settings and try again.")
      }
      const cur = attemptRef.current
      const rechecks = cur.questions.map((_, k) => cur.rechecks?.[k] ?? null)
      rechecks[i] =
        out.kind === 'unclear' ? { outcome: 'unclear', reason: out.reason } : { outcome: out.kind, evidence: out.evidence }
      if (out.kind !== 'corrected') {
        commitAttempt({ ...cur, rechecks })
        return
      }
      const questions = [...cur.questions]
      questions[i] = out.question
      const disputed = cur.questions.map((_, k) => (k === i ? false : isDisputed(cur, k)))
      const marks = [...cur.marks]
      const feedback = [...cur.feedback]
      if (out.question.format === 'descriptive') {
        marks[i] = grade?.marks ?? null
        feedback[i] = grade?.feedback ?? ''
      } else {
        marks[i] = scoreObjective(out.question, pickedOf(cur, i), settings)
      }
      commitAttempt(recomputeTotals({ ...cur, questions, disputed, marks, feedback, rechecks }))
      if (vaultId) removeNeverAsk(cur.origin && cur.origin !== 'notes' ? openBucket(vaultId) : vaultId, q.question)
    } finally {
      setRechecking(null)
    }
  }
  const canSave = Boolean(onSave && !grading && gradingIndex === null && (done || settings.feedback === 'immediate'))

  return (
    <div className={styles.analysisCard}>
      <div className={styles.quizScore}>
        <span className={styles.sectionTitle}>Quiz · {plural(attempt.questions.length, 'question')}</span>
        <span className={styles.quizScoreValue}>
          {attempt.max > 0 ? `${attempt.total} / ${attempt.max}` : `0 / ${attempt.questions.reduce((s, q, i) => s + (isDisputed(attempt, i) ? 0 : q.marks), 0)}`}
        </span>
      </div>
      {attempt.origin === 'web' && (
        <p className={styles.quizProvenance}>
          From the web · {plural(attempt.sources?.length ?? 0, 'page')}
          {attempt.failedPages ? ` · couldn't read ${plural(attempt.failedPages, 'page')}` : ''}
          {!hasWebSearch(config) && " · Web search isn't set up — only your links were used."}
        </p>
      )}
      {attempt.origin === 'ai' && (
        <p className={styles.quizProvenance}>From the AI's general knowledge — not checked against a source</p>
      )}
      {attempt.verified === 'failed' && <p className={styles.quizProvenance}>Answers not checked — the check failed</p>}
      {attempt.verified === 'off' && <p className={styles.quizProvenance}>Answers not checked — checking is off</p>}
      {(attempt.dropped ?? 0) > 0 && (
        <p className={styles.quizProvenance}>
          {attempt.dropped === 1
            ? "1 question dropped — its answer couldn't be supported"
            : `${attempt.dropped} questions dropped — their answers couldn't be supported`}
        </p>
      )}

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
                {i + 1}. {q.question} <span className={styles.quizExpl}>({plural(q.marks, 'mark')})</span>
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
                  {attempt.marks[i] === null ? 'Ungraded' : `${attempt.marks[i]} / ${plural(q.marks, 'mark')}`}
                  {attempt.feedback[i] ? ` — ${attempt.feedback[i]}` : ''}
                </p>
                {q.source ? (
                  <p className={styles.quizProvenance}>
                    “{q.source.quote}”{' '}
                    <button className={styles.quizLink} title={q.source.title} onClick={() => void openWebPage(q.source!.url)}>
                      {q.source.title}
                    </button>
                  </p>
                ) : (
                  attempt.origin === 'ai' && <p className={styles.quizProvenance}>AI knowledge</p>
                )}
                {isDisputed(attempt, i) ? (
                  <p className={styles.quizProvenance}>
                    Disputed — not counted{' '}
                    <button className={styles.quizLink} onClick={() => setDisputed(i, false)}>
                      Undo
                    </button>
                  </p>
                ) : (
                  <button className={styles.quizLink} onClick={() => setDisputed(i, true)}>
                    This answer is wrong
                  </button>
                )}
                {q.corrected && <p className={styles.quizProvenance}>Corrected after recheck</p>}
                {isDisputed(attempt, i) && (attempt.origin === 'web' || attempt.origin === 'ai') && (
                  <>
                    <button
                      className={styles.quizLink}
                      disabled={rechecking !== null || (!hasWebSearch(config) && !q.source)}
                      title={
                        !hasWebSearch(config) && !q.source
                          ? 'Set up a web search provider in Settings → AI setup to recheck this answer'
                          : 'Look this answer up on the web'
                      }
                      onClick={() => void recheck(i)}
                    >
                      {rechecking === i ? 'Rechecking…' : 'Recheck on the web'}
                    </button>
                    {attempt.rechecks?.[i]?.outcome === 'unclear' && (
                      <p className={styles.quizProvenance}>Still unclear: {attempt.rechecks[i]?.reason}</p>
                    )}
                    {attempt.rechecks?.[i]?.outcome === 'confirmed' && attempt.rechecks[i]?.evidence && (
                      <p className={styles.quizProvenance}>
                        The key looks right: “{attempt.rechecks[i]!.evidence!.quote}”{' '}
                        <button className={styles.quizLink} title={attempt.rechecks[i]!.evidence!.title} onClick={() => void openWebPage(attempt.rechecks![i]!.evidence!.url)}>
                          {attempt.rechecks[i]!.evidence!.title}
                        </button>{' '}
                        <button className={styles.quizLink} onClick={() => setDisputed(i, false)}>
                          Withdraw dispute
                        </button>{' '}
                        <button className={styles.quizLink} onClick={() => {
                            const cur = attemptRef.current
                            commitAttempt({ ...cur, rechecks: cur.questions.map((_, k) => (k === i ? null : cur.rechecks?.[k] ?? null)) })
                          }}>
                          Keep dispute
                        </button>
                      </p>
                    )}
                  </>
                )}
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
