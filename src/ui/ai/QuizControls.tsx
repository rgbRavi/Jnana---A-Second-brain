// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/ui/ai/QuizControls.tsx
//
// The quiz settings surface, rendered inline (docked in the right-rail Focused
// scope panel). One value, one view — it writes the shared useQuizSettings store.
// (Previously a gear popover + compact toolbar; folded into the rail so every
// knob is visible without a second click.)

import { useState } from 'react'
import type { QuizFormat } from '../../types'
import { useQuizSettings } from '../../hooks/useQuizSettings'
import { clearAskedQuestions } from '../../core/ai/quizMemory'
import { SettingSelect, SettingSlider, SettingToggle } from '../settings/SettingControls'
import { toast } from '../../lib/toast'
import styles from './Ai.module.css'

const FORMAT_LABELS: [QuizFormat, string][] = [
  ['mcq', 'MCQ'],
  ['mcma', 'MCMA'],
  ['descriptive', 'Descriptive'],
]

const COUNT_OPTIONS = [3, 5, 6, 10, 15, 20].map((n) => ({ value: String(n), label: `${n}` }))

const DIFFICULTY_OPTIONS = [
  { value: 'mix', label: 'Mix' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

export function QuizSettingsBody({ vaultId }: { vaultId: string }) {
  const [settings, setSettings] = useQuizSettings()
  const [weightDraft, setWeightDraft] = useState<Partial<Record<QuizFormat, string>>>({})

  const toggleFormat = (f: QuizFormat, on: boolean) =>
    setSettings({ formats: { ...settings.formats, [f]: on } })

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

  return (
    <div className={styles.quizSettings}>
      <div className={styles.quizPopoverSection}>Generation</div>
      <div className={styles.quizPopoverRow}>
        <span>Questions</span>
        <SettingSelect
          value={String(settings.count)}
          onChange={(v) => setSettings({ count: Number(v) })}
          options={COUNT_OPTIONS}
          ariaLabel="Number of questions"
        />
      </div>
      <div className={styles.quizPopoverRow}>
        <span>Difficulty</span>
        <SettingSelect
          value={settings.difficulty}
          onChange={(v) => setSettings({ difficulty: v as typeof settings.difficulty })}
          options={DIFFICULTY_OPTIONS}
          ariaLabel="Question difficulty"
        />
      </div>

      <div className={styles.quizPopoverSection}>Question types</div>
      {FORMAT_LABELS.map(([f, label]) => (
        <div key={f} className={styles.quizPopoverRow}>
          <SettingToggle checked={settings.formats[f]} onChange={(on) => toggleFormat(f, on)} label={label} />
          <input
            className={styles.quizWeightInput}
            type="number"
            min={0.5}
            max={100}
            step={0.5}
            value={weightDraft[f] ?? String(settings.weights[f])}
            onChange={(e) => setWeightDraft((d) => ({ ...d, [f]: e.target.value }))}
            onBlur={() => commitWeight(f)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitWeight(f) }}
            aria-label={`${label} marks per question`}
            title={`${label} marks per question`}
          />
        </div>
      ))}

      <div className={styles.quizPopoverSection}>Marking</div>
      <SettingToggle
        checked={settings.negativeMarking}
        onChange={(v) => setSettings({ negativeMarking: v })}
        label="Negative marking"
        hint="deducts for a wrong answer, never for a skipped one"
      />
      {settings.negativeMarking && (
        <div className={styles.quizPopoverRow}>
          <span>Penalty: {settings.negativeFraction}× marks</span>
          <span className={styles.quizSliderCell}>
            <SettingSlider
              value={settings.negativeFraction}
              min={0.1}
              max={1}
              step={0.05}
              onChange={(v) => setSettings({ negativeFraction: v })}
              ariaLabel="Negative marking fraction"
            />
          </span>
        </div>
      )}
      <div className={styles.quizPopoverRow}>
        <span>Multi-answer scoring</span>
        <SettingSelect
          value={settings.mcmaRule}
          onChange={(v) => setSettings({ mcmaRule: v as typeof settings.mcmaRule })}
          options={[
            { value: 'partial', label: 'Partial credit' },
            { value: 'allOrNothing', label: 'All or nothing' },
            { value: 'proportional', label: 'Proportional' },
          ]}
          ariaLabel="Multi-answer scoring rule"
        />
      </div>

      <div className={styles.quizPopoverSection}>Quiz</div>
      <div className={styles.quizPopoverRow}>
        <span>Show answers</span>
        <SettingSelect
          value={settings.feedback}
          onChange={(v) => setSettings({ feedback: v as typeof settings.feedback })}
          options={[
            { value: 'end', label: 'After submitting' },
            { value: 'immediate', label: 'As I answer' },
          ]}
          ariaLabel="When to show answers"
        />
      </div>
      <div className={styles.quizPopoverRow}>
        <span>Notes source</span>
        <SettingSelect
          value={settings.source}
          onChange={(v) => setSettings({ source: v as typeof settings.source })}
          options={[
            { value: 'retrieval', label: 'Semantic index' },
            { value: 'raw', label: 'Scoped notes' },
          ]}
          ariaLabel="Notes source"
        />
      </div>
      <button
        className={styles.btn}
        onClick={() => {
          clearAskedQuestions(vaultId)
          toast.success('Question history cleared for this vault.')
        }}
      >
        Forget asked questions
      </button>
    </div>
  )
}
