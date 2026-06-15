import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { subscribeDialog, getDialog, resolveDialog, type ActiveDialog } from '../lib/dialog'
import styles from './DialogHost.module.css'

/** Renders the app-wide modal dialog (choice / prompt / confirm). Mount once near the root. */
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

        {dialog.kind === 'choice' && <ChoiceBody dialog={dialog} />}
        {dialog.kind === 'prompt' && <PromptBody key={dialog.id} dialog={dialog} />}
        {dialog.kind === 'confirm' && <ConfirmBody dialog={dialog} />}
      </div>
    </div>
  )
}

function ChoiceBody({ dialog }: { dialog: Extract<ActiveDialog, { kind: 'choice' }> }) {
  return (
    <>
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
    </>
  )
}

function PromptBody({ dialog }: { dialog: Extract<ActiveDialog, { kind: 'prompt' }> }) {
  const [value, setValue] = useState(dialog.defaultValue ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = () => {
    const trimmed = value.trim()
    resolveDialog(trimmed ? trimmed : null)
  }

  return (
    <>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={value}
        placeholder={dialog.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={() => resolveDialog(null)}>
          {dialog.cancelLabel ?? 'Cancel'}
        </button>
        <button type="button" className={styles.confirm} onClick={submit} disabled={!value.trim()}>
          {dialog.confirmLabel ?? 'OK'}
        </button>
      </div>
    </>
  )
}

function ConfirmBody({ dialog }: { dialog: Extract<ActiveDialog, { kind: 'confirm' }> }) {
  return (
    <div className={styles.footer}>
      <button type="button" className={styles.cancel} onClick={() => resolveDialog(null)}>
        {dialog.cancelLabel ?? 'Cancel'}
      </button>
      <button
        type="button"
        className={`${styles.confirm} ${dialog.danger ? styles.confirmDanger : ''}`}
        onClick={() => resolveDialog('confirm')}
        autoFocus
      >
        {dialog.confirmLabel ?? 'Confirm'}
      </button>
    </div>
  )
}
