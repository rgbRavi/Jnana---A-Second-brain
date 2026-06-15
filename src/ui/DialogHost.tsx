import { useEffect, useSyncExternalStore } from 'react'
import { subscribeDialog, getDialog, resolveDialog } from '../lib/dialog'
import styles from './DialogHost.module.css'

/** Renders the app-wide modal choice dialog. Mount once near the app root. */
export function DialogHost() {
  const dialog = useSyncExternalStore(subscribeDialog, getDialog, getDialog)

  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolveDialog(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  if (!dialog) return null

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resolveDialog(null)
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={dialog.title}>
        <div className={styles.header}>
          <h2 className={styles.title}>{dialog.title}</h2>
          {dialog.message && <p className={styles.message}>{dialog.message}</p>}
        </div>

        <div className={styles.options}>
          {dialog.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`${styles.option} ${opt.primary ? styles.optionPrimary : ''}`}
              onClick={() => resolveDialog(opt.value)}
              autoFocus={opt.primary}
            >
              {opt.icon && (
                <span className={styles.optionIcon} aria-hidden="true">
                  {opt.icon}
                </span>
              )}
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{opt.label}</span>
                {opt.description && <span className={styles.optionDesc}>{opt.description}</span>}
              </span>
              <span className={styles.optionArrow} aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancel} onClick={() => resolveDialog(null)}>
            {dialog.cancelLabel ?? 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
