// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Small form-control primitives shared by the Appearance tabs. Co-located
// here rather than in src/ui/ since they're shaped specifically for the
// Theme Studio editor (and aren't yet needed elsewhere).

import { createContext, useContext, useId, useState } from 'react'
import { SettingField, hintId } from '../SettingLayout'
import { SettingSlider } from '../SettingControls'
import { SettingSegmented } from '../SettingNav'
import styles from './Appearance.module.css'

/** The floating overlay is ~360px wide, so its fields stay stacked (the shared
 *  row layout is gated on the *viewport*, which says nothing about the overlay). */
export const StackedFields = createContext(false)

/** Theme Studio's SettingField: same rows + ⓘ hints, stacked inside the overlay. */
export function StudioField(props: Omit<React.ComponentProps<typeof SettingField>, 'stacked'>) {
  return <SettingField {...props} stacked={useContext(StackedFields)} />
}

/** Human names for ACCENT_SWATCHES, matched by hex. */
const SWATCH_NAMES: Record<string, string> = {
  '#7c6af7': 'Violet',
  '#6a52e0': 'Indigo',
  '#2a8af6': 'Blue',
  '#1f9d6b': 'Green',
  '#e0883c': 'Orange',
  '#e0526e': 'Rose',
  '#d94fd0': 'Magenta',
  '#ffd200': 'Yellow',
}

/** A labelled Segmented row. A <label> can't name a role=group, so the group
 *  carries its own aria-label; htmlFor/id just keep the hint (ⓘ) wiring valid. */
export function SegmentedField<T extends string>({
  label,
  hint,
  ...rest
}: {
  label: string
  hint?: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  const id = useId()
  return (
    <StudioField label={label} htmlFor={id} hint={hint}>
      <SettingSegmented id={id} ariaLabel={label} describedBy={hint ? hintId(id) : undefined} {...rest} />
    </StudioField>
  )
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  hint,
  hintVisible,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  hint?: string
  hintVisible?: boolean
  onChange: (v: number) => void
}) {
  const id = useId()
  return (
    <StudioField label={label} htmlFor={id} hint={hint} hintVisible={hintVisible} value={`${value}${suffix}`}>
      <SettingSlider
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        ariaLabel={label}
        formatValue={(v) => `${v}${suffix}`}
      />
    </StudioField>
  )
}

const HEX6 = /^#[0-9a-f]{6}$/i

export function ColorField({
  label,
  value,
  swatches,
  derived,
  hint,
  onChange,
}: {
  label: string
  value: string
  swatches?: string[]
  /** Derived shades shown under the picker, as [name, colour]. */
  derived?: [string, string][]
  hint?: string
  onChange: (hex: string) => void
}) {
  const id = useId()
  // Typed text is a draft: only a complete #rrggbb is committed (while typing, or
  // on blur/Enter); an incomplete one is flagged and reverted on blur, so a
  // half-typed "#7" never reaches the theme (and its persistence).
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? value
  const invalid = draft !== null && !HEX6.test(draft.trim())
  const errId = `${id}-err`
  return (
    <StudioField label={label} htmlFor={id} hint={hint}>
      <div className={styles.colorControl}>
        <div className={styles.colorRow}>
          <label className={styles.colorSwatch} style={{ background: value }}>
            <input type="color" aria-label={`${label} picker`} value={value} onChange={(e) => onChange(e.target.value)} />
          </label>
          <input
            id={id}
            type="text"
            className={`${styles.hexInput} ${invalid ? styles.hexInputInvalid : ''}`}
            aria-label={`${label} hex value`}
            value={text}
            spellCheck={false}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errId : undefined}
            onChange={(e) => {
              setDraft(e.target.value)
              const v = e.target.value.trim()
              if (HEX6.test(v)) onChange(v)
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </div>
        {invalid && (
          <p id={errId} role="alert" className={styles.errorText}>
            Use a six-digit hex colour, like #7c6af7.
          </p>
        )}
        {swatches && (
          <div className={styles.swatchRow}>
            {swatches.map((s) => {
              const name = SWATCH_NAMES[s.toLowerCase()] ?? s
              return (
                <button
                  key={s}
                  type="button"
                  className={`${styles.miniSwatch} ${value.toLowerCase() === s.toLowerCase() ? styles.miniSwatchOn : ''}`}
                  style={{ background: s }}
                  title={`${name} (${s})`}
                  aria-label={`${label} ${name}`}
                  aria-pressed={value.toLowerCase() === s.toLowerCase()}
                  onClick={() => onChange(s)}
                />
              )
            })}
          </div>
        )}
        {derived && (
          <div className={styles.derivedRow} role="group" aria-label="Derived shades: base, hover, active">
            {derived.map(([name, c]) => (
              <span key={name} className={styles.derivedSwatch} style={{ background: c }} title={name} />
            ))}
          </div>
        )}
      </div>
    </StudioField>
  )
}
