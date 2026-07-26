// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/ui/ai/QuizControls.tsx
//
// Quiz mode's two control surfaces: a gear-button popover holding every setting,
// and an optional compact toolbar repeating the four knobs you touch each run.
// Both write to the same store (hooks/useQuizSettings), so they are two views of
// one value, not two states to reconcile. The popover is portaled to <body> and
// viewport-clamped for the same reason SuggestionMenu is — the chat column
// scrolls and would otherwise clip it.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Settings2 } from 'lucide-react'
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

function calcPopoverPos(
  anchorRef: React.RefObject<HTMLButtonElement | null>,
  popoverRef: React.RefObject<HTMLDivElement | null>,
): { top: number; left: number } {
  if (!anchorRef.current || !popoverRef.current) return { top: 0, left: 0 }
  const r = anchorRef.current.getBoundingClientRect()
  const width = 320
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
  const popoverH = popoverRef.current.getBoundingClientRect().height ?? 0
  const below = r.bottom + 6
  const top = popoverH && below + popoverH > window.innerHeight - 8
    ? Math.max(8, r.top - popoverH - 6)
    : below
  return { top, left }
}

export function QuizControls({ vaultId }: { vaultId: string }) {
  const [settings, setSettings] = useQuizSettings()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [weightDraft, setWeightDraft] = useState<Partial<Record<QuizFormat, string>>>({})

  // Close on outside press / Escape — the button and the portaled popover both
  // count as "inside" (capture phase, matching SuggestionMenu pattern).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      // A SettingSelect inside this popover portals its listbox to document.body,
      // so an option row is a DOM sibling, not a descendant — picking one must not
      // dismiss the popover that owns the select.
      if (target.closest('[role="listbox"]')) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Position the portaled popover under the button, clamped to the viewport (flip
  // above if it would overflow the bottom). Re-run when content changes height.
  useLayoutEffect(() => {
    if (!open) return
    setPos(calcPopoverPos(anchorRef, popoverRef))
  }, [open, settings.negativeMarking])

  // Re-position on window resize while popover is open.
  useEffect(() => {
    if (!open) return
    const onResize = () => setPos(calcPopoverPos(anchorRef, popoverRef))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

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
    <>
      <button
        ref={anchorRef}
        className={styles.btn}
        title="Quiz settings"
        aria-label="Quiz settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Settings2 size={14} />
      </button>

      {settings.showToolbar && (
        <div className={styles.quizToolbar}>
          <span className={styles.quizToolbarGroup}>
            <label htmlFor="quiz-count">Questions</label>
            <SettingSelect
              id="quiz-count"
              value={String(settings.count)}
              onChange={(v) => setSettings({ count: Number(v) })}
              options={COUNT_OPTIONS}
              ariaLabel="Number of questions"
            />
          </span>

          <span className={styles.quizToolbarGroup}>
            {FORMAT_LABELS.map(([f, label]) => (
              <label key={f} className={styles.quizToolbarCheck}>
                <input
                  type="checkbox"
                  checked={settings.formats[f]}
                  onChange={(e) => toggleFormat(f, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </span>

          <span className={styles.quizToolbarGroup}>
            <label htmlFor="quiz-difficulty">Difficulty</label>
            <SettingSelect
              id="quiz-difficulty"
              value={settings.difficulty}
              onChange={(v) => setSettings({ difficulty: v as typeof settings.difficulty })}
              options={[
                { value: 'mix', label: 'Mix' },
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
              ariaLabel="Question difficulty"
            />
          </span>
        </div>
      )}

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className={styles.quizPopover}
            style={{ top: pos.top, left: pos.left }}
            role="dialog"
            aria-label="Quiz settings"
          >
              <div className={styles.quizPopoverSection}>Question types</div>
              {FORMAT_LABELS.map(([f, label]) => (
                <div key={f} className={styles.quizPopoverRow}>
                  <SettingToggle
                    checked={settings.formats[f]}
                    onChange={(on) => toggleFormat(f, on)}
                    label={label}
                  />
                  <input
                    className={styles.quizWeightInput}
                    type="number"
                    min={0.5}
                    max={100}
                    step={0.5}
                    value={weightDraft[f] ?? String(settings.weights[f])}
                    onChange={(e) => setWeightDraft((d) => ({ ...d, [f]: e.target.value }))}
                    onBlur={() => commitWeight(f)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitWeight(f)
                    }}
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
              <SettingToggle
                checked={settings.showToolbar}
                onChange={(v) => setSettings({ showToolbar: v })}
                label="Show quick toolbar"
              />
              <button
                className={styles.btn}
                onClick={() => {
                  clearAskedQuestions(vaultId)
                  toast.success('Question history cleared for this vault.')
                }}
              >
                Forget asked questions
              </button>
            </div>,
          document.body,
        )}
    </>
  )
}
