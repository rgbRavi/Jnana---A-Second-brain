// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import styles from '../Dashboard.module.css'

interface Props {
  label: string
  sublabel?: string
  status: 'running' | 'done' | 'error'
}

const ICON = { running: '⏳', done: '✓', error: '⚠' }

export function TaskCard({ label, sublabel, status }: Props) {
  return (
    <div className={`${styles.task} ${styles[`task_${status}`]}`}>
      <span className={styles.taskStatus} aria-hidden="true">
        {ICON[status]}
      </span>
      <div className={styles.taskMeta}>
        <span className={styles.taskLabel}>{label}</span>
        {sublabel && <span className={styles.taskSub}>{sublabel}</span>}
      </div>
      {status === 'running' && (
        <span className={styles.taskBar} aria-hidden="true">
          <span className={styles.taskBarFill} />
        </span>
      )}
    </div>
  )
}
