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
          <span className={styles.icon} aria-hidden="true">
            {ICON[t.variant]}
          </span>
          <span className={styles.message}>{t.message}</span>
          <button className={styles.close} onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
