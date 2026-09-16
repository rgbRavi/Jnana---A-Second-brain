// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { AnalysisResult } from '../../types'
import styles from './Ai.module.css'

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className={styles.section}>
      <span className={styles.sectionTitle}>{title}</span>
      <div className={styles.list}>
        {items.map((item, i) => (
          <span key={i} className={styles.listItem}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Renders a grounded analysis (summary + concepts/questions/weak-spots + sources). */
export function AnalysisCard({
  result,
  onOpenNote,
}: {
  result: AnalysisResult
  onOpenNote: (noteId: string) => void
}) {
  return (
    <div className={styles.analysisCard}>
      {result.summary && <p className={styles.summary}>{result.summary}</p>}
      <Section title="Key concepts" items={result.keyConcepts} />
      <Section title="Open questions" items={result.openQuestions} />
      <Section title="Weak spots" items={result.weakSpots} />

      {result.sourceNotes.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Source notes</span>
          <div className={styles.sources}>
            {result.sourceNotes.map((s) => (
              <button key={s.noteId} className={styles.sourceChip} onClick={() => onOpenNote(s.noteId)}>
                {s.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
