// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { ACCENT_SWATCHES, FONTS, READING_SCALE_MAX, READING_SCALE_MIN, READING_SCALE_STEP } from '../../../core/themes/tokens'
import { deriveAccent } from '../../../core/themes/apply'
import type { UseThemeApi } from '../../../hooks/useTheme'
import { useInstalledFonts } from '../../../hooks/useInstalledFonts'
import type { ThemeFonts } from '../../../types'
import { ColorField, Segmented, SliderField } from './controls'
import { SettingSelect, type SelectOption, type SelectGroup } from '../SettingControls'
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
      <p className={styles.hint}>The highlight colour for buttons, links, and selections. Hover and active shades are derived automatically (swatches above).</p>

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
        <p className={styles.hint}>Light or dark foundation for every surface and text colour.</p>
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

      <SliderField
        label="Corner radius"
        value={radius}
        min={0}
        max={22}
        suffix="px"
        hint="Roundness of cards, buttons, inputs, and menus. 0 = sharp corners."
        onChange={setRadius}
      />

      <p className={styles.hint}>Interface = menus, lists, and controls. Reading = note reader body text. Monospace = code blocks.</p>
      {FONT_ROLES.map(({ role, label }) => {
        const fontOptions: (SelectOption | SelectGroup)[] = [
          {
            label: 'Built-in',
            options: FONTS[role].map((f) => ({ value: f.id, label: f.note ? `${f.label} — ${f.note}` : f.label })),
          },
          ...(installed.length > 0
            ? [{ label: 'Installed', options: installed.map((f) => ({ value: f.family, label: f.family })) }]
            : []),
        ]
        return (
          <div key={role} className={styles.field}>
            <label>{label} font</label>
            <SettingSelect
              ariaLabel={`${label} font`}
              value={theme.fonts[role]}
              options={fontOptions}
              onChange={(v) => setFont(role, v)}
            />
          </div>
        )
      })}

      <FontManager installed={installed} onInstall={install} onRemove={remove} />

      <SliderField
        label="Reading scale"
        value={theme.readingScale}
        min={READING_SCALE_MIN}
        max={READING_SCALE_MAX}
        step={READING_SCALE_STEP}
        suffix="×"
        hint="Text size in the note reader only (Interface stays fixed). Pairs with the Reading font above."
        onChange={(v) => patch({ readingScale: v })}
      />
    </div>
  )
}
