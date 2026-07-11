// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import styles from '../Dashboard.module.css'

interface Props {
  label: string
  value: string | number
  sub?: string
  icon?: string
  accent?: string
}

/** A single headline metric (used in the hero stat grid). */
export function StatCard({ label, value, sub, icon, accent }: Props) {
  return (
    <div className={styles.stat}>
      {icon && (
        <span className={styles.statIcon} style={accent ? { color: accent } : undefined} aria-hidden="true">
          {icon}
        </span>
      )}
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  )
}
