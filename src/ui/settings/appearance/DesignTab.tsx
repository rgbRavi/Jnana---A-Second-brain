// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { ACCENT_SWATCHES, READING_SCALE_MAX, READING_SCALE_MIN, READING_SCALE_STEP } from '../../../core/themes/tokens'
import { deriveAccent } from '../../../core/themes/apply'
import type { UseThemeApi } from '../../../hooks/useTheme'
import { ColorField, Segmented, SliderField } from './controls'
import styles from './Appearance.module.css'

export function DesignTab({ api }: { api: UseThemeApi }) {
  const { theme, setToken, setBase, setRadius, patch } = api
  const accent = theme.tokens['--accent']
  const derived = deriveAccent(accent, theme.base)
  const radius = parseInt(theme.tokens['--radius-md'], 10) || 10

  return (
    <div className={styles.tabPane}>
      <ColorField label="Accent" value={accent} swatches={ACCENT_SWATCHES} onChange={(v) => setToken('--accent', v)} />
      <div className={styles.derivedRow}>
        <span className={styles.derivedSwatch} style={{ background: accent }} title="Base" />
        <span className={styles.derivedSwatch} style={{ background: derived.hover }} title="Hover" />
        <span className={styles.derivedSwatch} style={{ background: derived.active }} title="Active" />
      </div>

      <div className={styles.field}>
        <label>Base mode</label>
        <Segmented
          value={theme.base}
          onChange={setBase}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </div>

      <div className={styles.field}>
        <label>Density</label>
        <Segmented
          value={theme.density}
          onChange={(v) => patch({ density: v })}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'cozy', label: 'Cozy' },
            { value: 'comfortable', label: 'Comfortable' },
          ]}
        />
        <p className={styles.hint}>Sets --density — not yet wired into spacing (an upcoming pass).</p>
      </div>

      <SliderField label="Corner radius" value={radius} min={0} max={22} suffix="px" onChange={setRadius} />

      <SliderField
        label="Reading scale"
        value={theme.readingScale}
        min={READING_SCALE_MIN}
        max={READING_SCALE_MAX}
        step={READING_SCALE_STEP}
        suffix="×"
        onChange={(v) => patch({ readingScale: v })}
      />
      <p className={styles.hint}>Sets --reading-scale — not yet wired into the note reader (an upcoming pass).</p>
    </div>
  )
}
