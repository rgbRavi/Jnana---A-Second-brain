// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { ACCENT_SWATCHES, FONTS, READING_SCALE_MAX, READING_SCALE_MIN, READING_SCALE_STEP } from '../../../core/themes/tokens'
import { deriveAccent } from '../../../core/themes/apply'
import type { UseThemeApi } from '../../../hooks/useTheme'
import { useInstalledFonts } from '../../../hooks/useInstalledFonts'
import type { ThemeFonts } from '../../../types'
import { ColorField, SegmentedField, SliderField, StudioField } from './controls'
import { SettingSection } from '../SettingLayout'
import { SettingSelect, SettingToggle, type SelectOption, type SelectGroup } from '../SettingControls'
import { FontManager } from './FontManager'
import { WallpaperField } from './WallpaperField'
import styles from './Appearance.module.css'

const FONT_ROLES: { role: keyof ThemeFonts; label: string }[] = [
  { role: 'body', label: 'Interface' },
  { role: 'reading', label: 'Reading (note reader)' },
  { role: 'mono', label: 'Monospace' },
]

export function DesignTab({ api }: { api: UseThemeApi }) {
  const { theme, setToken, setBase, setRadius, setGlassEffects, patch, setFont } = api
  const { fonts: installed, installing, install, remove } = useInstalledFonts()
  const accent = theme.tokens['--accent']
  const derived = deriveAccent(accent, theme.base)
  const radius = parseInt(theme.tokens['--radius-md'], 10) || 10

  return (
    <div className={styles.tabPane}>
      <SettingSection title="Colour & shape">
        <ColorField
          label="Accent"
          value={accent}
          swatches={ACCENT_SWATCHES}
          derived={[
            ['Base', accent],
            ['Hover', derived.hover],
            ['Active', derived.active],
          ]}
          hint="The highlight colour for buttons, links, and selections. Hover and active shades are derived automatically."
          onChange={(v) => setToken('--accent', v)}
        />
        <SegmentedField
          label="Light or dark"
          hint="The starting point for every background and text colour; your accent stays the same."
          value={theme.base}
          onChange={setBase}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />

        <SegmentedField
          label="Density"
          hint="Scales padding and gaps across the app."
          value={theme.density}
          onChange={(v) => patch({ density: v })}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'cozy', label: 'Cozy' },
            { value: 'comfortable', label: 'Comfortable' },
          ]}
        />

      <SliderField
        label="Corner radius"
        value={radius}
        min={0}
        max={22}
        suffix="px"
        hint="Roundness of cards, buttons, inputs, and menus. 0 = sharp corners."
        onChange={setRadius}
      />

      <SettingToggle
        checked={!!theme.glassEffects}
        onChange={setGlassEffects}
        label="Glass & gradient effects"
        hint="Frosted, translucent panels and a soft accent gradient behind the AI view. Off keeps surfaces solid and calm."
      />
      </SettingSection>

      <WallpaperField api={api} />

      <SettingSection
        title="Fonts"
        intro="Interface = menus, lists, and controls. Reading = note reader body text. Monospace = code blocks."
      >
      {FONT_ROLES.map(({ role, label }) => {
        const builtinIds = FONTS[role].map((f) => f.id)
        const stored = theme.fonts[role]
        // A stored family that was since removed would leave the select blank —
        // show the role's default instead (the CSS already falls back to it).
        const known = builtinIds.includes(stored) || installed.some((f) => f.family === stored)
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
          <StudioField key={role} label={`${label} font`} htmlFor={`font-${role}`}>
            <SettingSelect
              id={`font-${role}`}
              ariaLabel={`${label} font`}
              value={known ? stored : builtinIds[0]}
              options={fontOptions}
              onChange={(v) => setFont(role, v)}
            />
          </StudioField>
        )
      })}

      <FontManager installed={installed} installing={installing} onInstall={install} onRemove={remove} />
      </SettingSection>

      <SettingSection title="Reading">
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
      </SettingSection>
    </div>
  )
}
