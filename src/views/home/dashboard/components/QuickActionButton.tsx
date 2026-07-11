// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import styles from '../Dashboard.module.css'

interface Props {
  icon: string
  label: string
  onClick: () => void
}

export function QuickActionButton({ icon, label, onClick }: Props) {
  return (
    <button type="button" className={styles.quickAction} onClick={onClick}>
      <span className={styles.quickIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.quickLabel}>{label}</span>
    </button>
  )
}
