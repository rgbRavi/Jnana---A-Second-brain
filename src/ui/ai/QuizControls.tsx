// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/ui/ai/QuizControls.tsx
//
// The quiz settings surface, rendered inline (docked in the right-rail Focused
// scope panel). One value, one view — it writes the shared useQuizSettings store.
// (Previously a gear popover + compact toolbar; folded into the rail so every
// knob is visible without a second click.)
//
// Layout is built for a narrow rail: every field stacks its label above a
// full-width control, short choice sets are segmented buttons (the same look as
// the Topic/Time/Note scope tabs above), and each non-obvious choice explains
// itself in one muted line instead of relying on the label alone.

import { useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import type { QuizFormat, QuizSettings } from '../../types'
import { useQuizSettings } from '../../hooks/useQuizSettings'
import { clearAskedQuestions } from '../../core/ai/quizMemory'
import { SettingSelect, SettingSlider, SettingToggle } from '../settings/SettingControls'
import { toast } from '../../lib/toast'
import styles from './Ai.module.css'

const FORMATS: { id: QuizFormat; label: string; hint: string }[] = [
  { id: 'mcq', label: 'MCQ', hint: 'One correct option' },
  { id: 'mcma', label: 'MCMA', hint: 'Several correct options' },
  { id: 'descriptive', label: 'Descriptive', hint: 'Short written answer, AI-graded' },
]

const COUNT_PRESETS = [5, 10, 15, 20]
/** Upper bound for a typed count — one generation call has to produce them all. */
const MAX_COUNT = 50
const COUNT_HINT =
  'More questions take longer to generate, and need more note content to draw from — ' +
  'thin notes can come back with fewer questions than asked.'

const DIFFICULTY: { value: QuizSettings['difficulty']; label: string }[] = [
  { value: 'mix', label: 'Mix' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const MCMA_RULES: { value: QuizSettings['mcmaRule']; label: string; hint: string }[] = [
  { value: 'partial', label: 'Partial credit', hint: 'Each right pick earns its share; each wrong pick costs the penalty.' },
  { value: 'allOrNothing', label: 'All or nothing', hint: 'Full marks only for exactly the right set of options.' },
  { value: 'proportional', label: 'Proportional', hint: 'A share of marks for right picks; any wrong pick scores zero.' },
]

const FEEDBACK: { value: QuizSettings['feedback']; label: string }[] = [
  { value: 'end', label: 'After submitting' },
  { value: 'immediate', label: 'As I answer' },
]

const SOURCES: { value: QuizSettings['source']; label: string; hint: string }[] = [
  { value: 'retrieval', label: 'Semantic index', hint: 'The most relevant passages from the AI index.' },
  { value: 'raw', label: 'Scoped notes', hint: 'The scoped notes as they are — no index needed.' },
]

/** Segmented single-choice buttons — the scope tabs' look, for short option sets. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div className={styles.cSeg} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`${styles.cSegBtn} ${value === o.value ? styles.cSegBtnActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A label stacked over its control, with an optional trailing value and hint. */
function Field({ label, trail, hint, children }: { label: ReactNode; trail?: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.qField}>
      <div className={styles.qFieldHead}>
        <span className={styles.qFieldLabel}>{label}</span>
        {trail && <span className={styles.qFieldTrail}>{trail}</span>}
      </div>
      {children}
      {hint && <p className={styles.qFieldHint}>{hint}</p>}
    </div>
  )
}

export function QuizSettingsBody({ vaultId }: { vaultId: string }) {
  const [settings, setSettings] = useQuizSettings()
  const [weightDraft, setWeightDraft] = useState<Partial<Record<QuizFormat, string>>>({})
  const [countDraft, setCountDraft] = useState<string | null>(null)

  const isPresetCount = COUNT_PRESETS.includes(settings.count)
  const enabledCount = FORMATS.filter((f) => settings.formats[f.id]).length

  const toggleFormat = (f: QuizFormat, on: boolean) => {
    // At least one format must stay on, or generation has nothing to produce.
    if (!on && enabledCount <= 1) {
      toast.info('Keep at least one question type on.')
      return
    }
    setSettings({ formats: { ...settings.formats, [f]: on } })
  }

  const commitWeight = (f: QuizFormat) => {
    const raw = weightDraft[f]
    if (raw === undefined) return
    const n = Number(raw)
    setSettings({
      weights: {
        ...settings.weights,
        [f]: Number.isFinite(n) && n > 0 ? Math.min(100, Math.max(0.5, n)) : settings.weights[f],
      },
    })
    setWeightDraft((d) => ({ ...d, [f]: undefined }))
  }

  const commitCount = () => {
    if (countDraft === null) return
    const n = Math.round(Number(countDraft))
    if (countDraft.trim() !== '' && Number.isFinite(n) && n >= 1) setSettings({ count: Math.min(MAX_COUNT, n) })
    setCountDraft(null)
  }

  const mcmaRule = MCMA_RULES.find((r) => r.value === settings.mcmaRule) ?? MCMA_RULES[0]
  const source = SOURCES.find((s) => s.value === settings.source) ?? SOURCES[0]

  return (
    <div className={styles.quizSettings}>
      <section className={styles.qGroup}>
        <h4 className={styles.qGroupTitle}>Questions</h4>

        <Field
          label={
            <>
              How many
              <span className={styles.quizInfo} title={COUNT_HINT} aria-label={COUNT_HINT} tabIndex={0}>
                <Info size={13} />
              </span>
            </>
          }
        >
          <div className={styles.qCountRow}>
            <Segmented
              value={isPresetCount ? String(settings.count) : ''}
              options={COUNT_PRESETS.map((n) => ({ value: String(n), label: n }))}
              onChange={(v) => {
                setCountDraft(null)
                setSettings({ count: Number(v) })
              }}
              ariaLabel="Number of questions"
            />
            <input
              className={`${styles.cField} ${styles.qNumInput} ${!isPresetCount ? styles.qNumInputActive : ''}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_COUNT}
              step={1}
              placeholder="Other"
              value={countDraft ?? (isPresetCount ? '' : String(settings.count))}
              onChange={(e) => setCountDraft(e.target.value)}
              onBlur={commitCount}
              onKeyDown={(e) => { if (e.key === 'Enter') commitCount() }}
              aria-label={`Custom number of questions, 1 to ${MAX_COUNT}`}
              title={`Custom number, 1–${MAX_COUNT}`}
            />
          </div>
        </Field>

        <Field label="Difficulty">
          <Segmented
            value={settings.difficulty}
            options={DIFFICULTY}
            onChange={(v) => setSettings({ difficulty: v })}
            ariaLabel="Question difficulty"
          />
        </Field>
      </section>

      <section className={styles.qGroup}>
        <div className={styles.qFieldHead}>
          <h4 className={styles.qGroupTitle}>Question types</h4>
          <span className={styles.qFieldTrail}>Marks each</span>
        </div>
        <div className={styles.qTypeList}>
          {FORMATS.map((f) => {
            const on = settings.formats[f.id]
            return (
              <div key={f.id} className={`${styles.qTypeRow} ${on ? '' : styles.qTypeRowOff}`}>
                <SettingToggle
                  checked={on}
                  onChange={(v) => toggleFormat(f.id, v)}
                  label={
                    <span className={styles.qTypeLabel}>
                      {f.label}
                      <small>{f.hint}</small>
                    </span>
                  }
                />
                <input
                  className={`${styles.cField} ${styles.qNumInput}`}
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  max={100}
                  step={0.5}
                  disabled={!on}
                  value={weightDraft[f.id] ?? String(settings.weights[f.id])}
                  onChange={(e) => setWeightDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                  onBlur={() => commitWeight(f.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitWeight(f.id) }}
                  aria-label={`${f.label} marks per question`}
                  title={`${f.label}: marks per question`}
                />
              </div>
            )
          })}
        </div>
      </section>

      <section className={styles.qGroup}>
        <h4 className={styles.qGroupTitle}>Marking</h4>

        <SettingToggle
          checked={settings.negativeMarking}
          onChange={(v) => setSettings({ negativeMarking: v })}
          label={
            <span className={styles.qTypeLabel}>
              Negative marking
              <small>Wrong answers lose marks. Skipped ones never do.</small>
            </span>
          }
        />
        {settings.negativeMarking && (
          <Field label="Penalty" trail={`${settings.negativeFraction.toFixed(2)}× marks`}>
            <div className={styles.quizSliderCell}>
              <SettingSlider
                value={settings.negativeFraction}
                min={0.1}
                max={1}
                step={0.05}
                onChange={(v) => setSettings({ negativeFraction: v })}
                ariaLabel="Penalty as a fraction of the question's marks"
              />
            </div>
          </Field>
        )}

        <Field label="Multi-answer scoring" hint={mcmaRule.hint}>
          <SettingSelect
            value={settings.mcmaRule}
            onChange={(v) => setSettings({ mcmaRule: v as QuizSettings['mcmaRule'] })}
            options={MCMA_RULES.map(({ value, label }) => ({ value, label }))}
            ariaLabel="Multi-answer scoring rule"
          />
        </Field>
      </section>

      <section className={styles.qGroup}>
        <h4 className={styles.qGroupTitle}>While taking it</h4>

        <Field label="Show answers">
          <Segmented
            value={settings.feedback}
            options={FEEDBACK}
            onChange={(v) => setSettings({ feedback: v })}
            ariaLabel="When to show answers"
          />
        </Field>

        <Field label="Build questions from" hint={source.hint}>
          <Segmented
            value={settings.source}
            options={SOURCES.map(({ value, label }) => ({ value, label }))}
            onChange={(v) => setSettings({ source: v })}
            ariaLabel="Notes source"
          />
        </Field>
      </section>

      <div className={styles.qFooter}>
        <button
          type="button"
          className={styles.qTextBtn}
          onClick={() => {
            clearAskedQuestions(vaultId)
            toast.success('Question history cleared for this vault.')
          }}
        >
          Forget asked questions
        </button>
        <p className={styles.qFieldHint}>New quizzes avoid repeating earlier questions. Clear this to allow repeats.</p>
      </div>
    </div>
  )
}
