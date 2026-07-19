// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useSyncExternalStore } from 'react'
import { subscribeToasts, getToasts, dismissToast, type ToastVariant } from '../lib/toast'
import styles from './Toaster.module.css'

const ICON: Record<ToastVariant, string> = {
  info: 'ℹ',
  success: '✓',
  error: '⚠',
}

/** Renders the app-wide toast stack. Mount once near the app root. */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  if (toasts.length === 0) return null

  return (
    <div className={styles.stack} role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.variant]}`} role="status" aria-live="polite">
          <div className={styles.row}>
            <span className={styles.icon} aria-hidden="true">
              {ICON[t.variant]}
            </span>
            <span className={styles.message}>{t.message}</span>
            <button className={styles.close} onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
          {t.progress != null && (
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, Math.max(0, t.progress)) * 100)}
            >
              <div
                className={styles.progressFill}
                style={{ width: `${Math.min(1, Math.max(0, t.progress)) * 100}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
