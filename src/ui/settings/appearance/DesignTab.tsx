// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { ACCENT_SWATCHES, FONTS, READING_SCALE_MAX, READING_SCALE_MIN, READING_SCALE_STEP } from '../../../core/themes/tokens'
import { deriveAccent } from '../../../core/themes/apply'
import type { UseThemeApi } from '../../../hooks/useTheme'
import { useInstalledFonts } from '../../../hooks/useInstalledFonts'
import type { ThemeFonts } from '../../../types'
import { ColorField, Segmented, SliderField } from './controls'
import { FontManager } from './FontManager'
import styles from './Appearance.module.css'

const FONT_ROLES: { role: keyof ThemeFonts; label: string }[] = [
  { role: 'body', label: 'Interface' },
  { role: 'reading', label: 'Reading (note reader)' },
  { role: 'mono', label: 'Monospace' },
]

export function DesignTab({ api }: { api: UseThemeApi }) {
  const { theme, setToken, setBase, setRadius, patch, setFont } = api
  const { fonts: installed, install, remove } = useInstalledFonts()
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
        <p className={styles.hint}>Scales padding and gaps across the app.</p>
      </div>

      <SliderField label="Corner radius" value={radius} min={0} max={22} suffix="px" onChange={setRadius} />

      {FONT_ROLES.map(({ role, label }) => (
        <div key={role} className={styles.field}>
          <label>{label} font</label>
          <select
            className={styles.select}
            value={theme.fonts[role]}
            onChange={(e) => setFont(role, e.target.value)}
          >
            <optgroup label="Built-in">
              {FONTS[role].map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                  {f.note ? ` — ${f.note}` : ''}
                </option>
              ))}
            </optgroup>
            {installed.length > 0 && (
              <optgroup label="Installed">
                {installed.map((f) => (
                  <option key={f.id} value={f.family}>
                    {f.family}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      ))}

      <FontManager installed={installed} onInstall={install} onRemove={remove} />
      <p className={styles.hint}>The note reader uses the Reading font + scale below.</p>

      <SliderField
        label="Reading scale"
        value={theme.readingScale}
        min={READING_SCALE_MIN}
        max={READING_SCALE_MAX}
        step={READING_SCALE_STEP}
        suffix="×"
        onChange={(v) => patch({ readingScale: v })}
      />
    </div>
  )
}
