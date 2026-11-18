// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import styles from '../Dashboard.module.css'

interface Props {
  label: string
  sublabel?: string
  status: 'running' | 'done' | 'error'
}

const ICON = { running: LoaderCircle, done: CircleCheck, error: CircleAlert }
const STATUS_LABEL = { running: 'In progress', done: 'Done', error: 'Failed' }

export function TaskCard({ label, sublabel, status }: Props) {
  const Icon = ICON[status]
  return (
    <div className={`${styles.task} ${styles[`task_${status}`]}`}>
      <span className={styles.taskStatus} role="img" aria-label={STATUS_LABEL[status]}>
        <Icon size={16} aria-hidden="true" />
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
