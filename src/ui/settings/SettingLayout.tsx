// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The one layout vocabulary every Settings panel shares: a panel column, a
// section heading, a field row (label → control → hint) and one button set.
// Panels compose these instead of carrying their own heading/hint/button CSS,
// so the content edge, type ramp and affordances stay identical tab to tab.
// (The panel *title* is rendered once by the Settings shell — panels don't
// repeat it.)

import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Info, Loader2 } from 'lucide-react'
import styles from './SettingLayout.module.css'

/** The one text input/textarea look in Settings — compose layout extras alongside it. */
export const settingInputClass = styles.input

/** Id of a field's hint paragraph, for the control's `aria-describedby`. */
export const hintId = (fieldId: string) => `${fieldId}-hint`

/**
 * Explanatory hints live behind an ⓘ button so rows stay one line: hover shows
 * the app tooltip (it reads `title`), click/Enter pins the hint open under the
 * row. The hint text is always in the DOM (visually hidden while closed), so the
 * control's `aria-describedby` still announces it. Consequence hints — what gets
 * deleted, where keys go — pass `hintVisible` and stay inline.
 */
export function useHintToggle() {
  const [open, setOpen] = useState(false)
  return { open, toggle: () => setOpen((o) => !o) }
}

/** Hints read as sentences: capitalise the first letter, end with punctuation. */
export function normalizeHint(text: string): string {
  const t = text.trim()
  if (!t) return t
  const s = t[0].toUpperCase() + t.slice(1)
  return /[.!?:…)]$/.test(s) ? s : `${s}.`
}

export function InfoButton({
  text,
  open,
  onToggle,
  controls,
  label,
}: {
  text: string
  open: boolean
  onToggle: () => void
  controls: string
  /** What the hint is about — names the button "About <label>" (default "More info"). */
  label?: string
}) {
  return (
    <button
      type="button"
      className={`${styles.info} ${open ? styles.infoOpen : ''}`}
      aria-label={label ? `About ${label}` : 'More info'}
      aria-expanded={open}
      aria-controls={controls}
      // The global tooltip shows this on hover; pinned open, the text is already on screen.
      title={open ? undefined : text}
      onClick={onToggle}
      onKeyDown={(e) => {
        // Close the pinned hint without letting the shell's Esc handler navigate Back.
        if (e.key === 'Escape' && open) {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      <Info size={14} aria-hidden />
    </button>
  )
}

export function HintText({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <p id={id} className={open ? styles.hint : styles.srOnly}>
      {children}
    </p>
  )
}

/** Panel column — one width rule for every tab. */
export function SettingPanel({ intro, children }: { intro?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.panel}>
      {intro && <p className={styles.intro}>{intro}</p>}
      {children}
    </div>
  )
}

/** Stable anchor for a section/disclosure titled `title` — what Settings search jumps to. */
export const settingAnchor = (title: string) =>
  title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** A titled group of fields inside a panel. */
export function SettingSection({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <section
      className={styles.section}
      data-setting-anchor={typeof title === 'string' ? settingAnchor(title) : undefined}
      tabIndex={-1}
    >
      <h3 className={styles.sectionTitle}>{title}</h3>
      {intro && <p className={styles.intro}>{intro}</p>}
      {children}
    </section>
  )
}

/**
 * A setting row. Wide windows: label + hint on the left, control on the right;
 * narrow windows stack them. `stacked` keeps a full-width control (textareas)
 * stacked everywhere. Pass the control's `id` as `htmlFor`; when there's a hint,
 * give the control `aria-describedby={hintId(id)}` so screen readers announce it.
 * `value` shows a readout beside the label (slider values).
 */
export function SettingField({
  label,
  htmlFor,
  hint,
  hintVisible,
  value,
  stacked,
  children,
}: {
  label: ReactNode
  htmlFor: string
  /** A string hint goes behind an ⓘ button; rich (ReactNode) hints stay inline. */
  hint?: ReactNode
  /** Keep a string hint on screen — for consequences the user must not miss. */
  hintVisible?: boolean
  value?: ReactNode
  stacked?: boolean
  children: ReactNode
}) {
  const { open, toggle } = useHintToggle()
  const tucked = typeof hint === 'string' && !hintVisible
  const hintNode = typeof hint === 'string' ? normalizeHint(hint) : hint
  return (
    <div className={`${styles.field} ${stacked ? '' : styles.row} ${hint && (!tucked || open) ? '' : styles.noHint}`}>
      <div className={styles.fieldHead}>
        <span className={styles.labelWrap}>
          <label htmlFor={htmlFor} className={styles.label}>{label}</label>
          {tucked && <InfoButton text={hintNode as string} open={open} onToggle={toggle} controls={hintId(htmlFor)} label={typeof label === 'string' ? label : undefined} />}
        </span>
        {value != null && <span className={styles.value}>{value}</span>}
      </div>
      <div className={styles.control}>{children}</div>
      {hint && (
        <HintText id={hintId(htmlFor)} open={!tucked || open}>
          {hintNode}
        </HintText>
      )}
    </div>
  )
}

/** Right-of-content action row. */
export function SettingActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>
}

/**
 * A row whose control is one or more buttons — sits on the control axis like any
 * other setting instead of floating in the label column:
 *   <SettingActionRow label="Restore" hint="Replaces everything…" hintVisible>
 *     <SettingButton variant="danger" onClick={…}>Restore backup…</SettingButton>
 *   </SettingActionRow>
 * `column` stacks the buttons. The buttons form a named group described by the hint,
 * so a screen reader entering it hears "Restore, group — Replaces everything…".
 */
export function SettingActionRow({
  label,
  hint,
  hintVisible,
  column,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  hintVisible?: boolean
  column?: boolean
  children: ReactNode
}) {
  // The label targets the wrapper, never a button: a <label for> on a button would
  // replace the button's own accessible name ("Replay the tour" → "Welcome tour").
  // A label on a non-labelable div is inert, so the row reads as label | buttons.
  const id = useId()
  return (
    <SettingField label={label} htmlFor={id} hint={hint} hintVisible={hintVisible}>
      <div
        id={id}
        role="group"
        aria-label={typeof label === 'string' ? label : undefined}
        aria-describedby={hint ? hintId(id) : undefined}
        className={`${styles.actions} ${column ? styles.actionsColumn : ''}`}
      >
        {children}
      </div>
    </SettingField>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger'
  /** In flight: disables, sets aria-busy and shows a spinner before the label. */
  busy?: boolean
}

/** The one Settings button. One `primary` per panel section at most. */
export function SettingButton({ variant = 'default', busy, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${styles.btn} ${styles[variant]} ${className ?? ''}`}
    >
      {busy && <Loader2 size={14} className={styles.spin} aria-hidden />}
      {children}
    </button>
  )
}
