// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import styles from '../Dashboard.module.css'

export type InsightTone = 'neutral' | 'warn' | 'accent' | 'good'

interface Props {
  count: number
  label: string
  tone?: InsightTone
  icon?: string
  onClick?: () => void
}

const TONE: Record<InsightTone, string> = {
  neutral: styles.insightNeutral,
  warn: styles.insightWarn,
  accent: styles.insightAccent,
  good: styles.insightGood,
}

/** A clickable count → label tile that nudges the user to improve the vault. */
export function InsightCard({ count, label, tone = 'neutral', icon, onClick }: Props) {
  return (
    <button
      type="button"
      className={`${styles.insight} ${TONE[tone]}`}
      onClick={onClick}
      disabled={!onClick}
      data-clickable={onClick ? 'true' : undefined}
    >
      <span className={styles.insightCount}>{count}</span>
      <span className={styles.insightLabel}>
        {icon && <span aria-hidden="true">{icon} </span>}
        {label}
      </span>
    </button>
  )
}
