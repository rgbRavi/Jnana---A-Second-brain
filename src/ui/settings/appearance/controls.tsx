// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Small form-control primitives shared by the Appearance tabs. Co-located
// here rather than in src/ui/ since they're shaped specifically for the
// Theme Studio editor (and aren't yet needed elsewhere).

import styles from './Appearance.module.css'

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className={styles.segmented}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`${styles.segmentBtn} ${value === o.value ? styles.segmentActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label>{label}</label>
        <span className={styles.value}>
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className={styles.slider}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function ColorField({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string
  value: string
  swatches?: string[]
  onChange: (hex: string) => void
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label>{label}</label>
      </div>
      <div className={styles.colorRow}>
        <label className={styles.colorSwatch} style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
        <input
          type="text"
          className={styles.hexInput}
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {swatches && (
        <div className={styles.swatchRow}>
          {swatches.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.miniSwatch} ${value.toLowerCase() === s.toLowerCase() ? styles.miniSwatchOn : ''}`}
              style={{ background: s }}
              title={s}
              onClick={() => onChange(s)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
