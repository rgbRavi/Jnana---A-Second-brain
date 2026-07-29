// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import styles from './Ai.module.css'

/**
 * One up-opening dropdown used by every composer toolbar control (Attach /
 * Capabilities / More). Shared trigger pill + panel + dismissal so the three
 * menus speak one visual vocabulary. The panel opens *upward* — the composer
 * pill sits at the bottom of the view.
 *
 * `children` is a render-prop given `close()` so a row can dismiss the menu.
 */
export function ComposerMenu({
  icon,
  label,
  badge,
  active,
  disabled,
  alignRight,
  children,
}: {
  icon: React.ReactNode
  label: string
  /** Count shown as an accent badge; falsy hides it. */
  badge?: number
  /** Highlight the trigger (something inside is engaged). */
  active?: boolean
  disabled?: boolean
  alignRight?: boolean
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)

  // Close on Escape while open (pointer-outside handled by the scrim).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className={styles.cMenu} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        style={pillStyle(!!active || open)}
      >
        {icon} {label}
        {badge ? <span className={styles.cBadge}>{badge}</span> : null}
        <ChevronDown
          size={13}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-fast) var(--motion-ease)' }}
        />
      </button>
      {open && (
        <>
          <div className={styles.cScrim} onClick={close} onContextMenu={(e) => { e.preventDefault(); close() }} />
          <div className={`${styles.cPop} ${alignRight ? styles.alignRight : ''}`} role="menu">
            {children(close)}
          </div>
        </>
      )}
    </div>
  )
}

/** A navigable / selectable row. `active` gives it the accent treatment. */
export function MenuRow({
  icon,
  label,
  hint,
  badge,
  trailing,
  active,
  disabled,
  onClick,
}: {
  icon?: React.ReactNode
  label: React.ReactNode
  hint?: string
  /** Accent count badge shown before any trailing adornment. Falsy hides it. */
  badge?: number
  trailing?: React.ReactNode
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`${styles.cRow} ${active ? styles.cRowActive : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span className={styles.cRowLabel}>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {(badge || trailing != null) && (
        <span className={styles.cRowTrail}>
          {badge ? <span className={styles.cBadge}>{badge}</span> : null}
          {trailing}
        </span>
      )}
    </button>
  )
}

/** Detail-view header with a back arrow (Capabilities master → detail). */
export function MenuHeader({ icon, title, onBack }: { icon: React.ReactNode; title: string; onBack: () => void }) {
  return (
    <div className={styles.cHead}>
      <button type="button" className={styles.cBack} onClick={onBack} aria-label="Back" title="Back">
        <ChevronDown size={16} style={{ transform: 'rotate(90deg)' }} />
      </button>
      {icon}
      <span>{title}</span>
    </div>
  )
}

/** The trigger-pill style, shared with the send-row so everything matches. */
export function pillStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    background: active
      ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
      : 'color-mix(in srgb, var(--surface-2) 90%, transparent)',
    backdropFilter: 'blur(8px)',
    color: active ? 'var(--accent)' : 'var(--text-2)',
    border: '1px solid ' + (active ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'color-mix(in srgb, var(--border) 80%, transparent)'),
    borderRadius: '999px',
    padding: '0.3rem 0.7rem',
    fontSize: '0.75rem',
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    transition: 'all var(--dur-base) var(--motion-ease)',
    boxShadow: active ? '0 0 10px color-mix(in srgb, var(--accent) 20%, transparent)' : 'var(--shadow-sm)',
  }
}
