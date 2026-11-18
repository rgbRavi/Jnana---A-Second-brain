// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { ReactNode } from 'react'
import styles from '../Dashboard.module.css'

interface Props {
  count: number
  label: string
  icon?: ReactNode
  onClick: () => void
}

/** A full-width "label · count" row that nudges the user to tidy the vault. */
export function InsightCard({ count, label, icon, onClick }: Props) {
  return (
    <button type="button" className={styles.insight} onClick={onClick}>
      {icon && (
        <span className={styles.insightIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.insightLabel}>{label}</span>
      <span className={styles.insightCount}>{count}</span>
    </button>
  )
}
