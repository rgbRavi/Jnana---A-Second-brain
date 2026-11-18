// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useComposerOptions } from '../../hooks/useComposerOptions'
import { SettingSelect, SettingSlider, SettingToggle, type SelectOption } from './SettingControls'
import { SettingField, SettingPanel, SettingSection, hintId } from './SettingLayout'

const TABLE_MODE_OPTIONS: SelectOption[] = [
  { value: 'widget', label: 'Live table (grid with Edit button)' },
  { value: 'inline', label: 'Raw CSV block' },
]

/** Settings → Quick note (route id `composer`): appearance & behavior of the floating note composer. */
export function ComposerSettingsPanel() {
  const [opts, setOpts] = useComposerOptions()

  return (
    <SettingPanel intro="The “Click to take a note” box on Home and Notes.">
      <SettingSection title="Look">
      <SettingField
        label="Transparency"
        htmlFor="composer-transparency"
        value={`${opts.transparency}%`}
        hint="How see-through the collapsed box is: 0 is solid, 100 is fully clear."
      >
        <SettingSlider
          id="composer-transparency"
          min={0}
          max={100}
          step={5}
          value={opts.transparency}
          ariaLabel="Transparency"
          onChange={(transparency) => setOpts({ transparency })}
        />
      </SettingField>

      {/* Composer-only: the app-wide glass effects toggle is Appearance → Design. */}
      <SettingToggle
        checked={opts.glass}
        onChange={(glass) => setOpts({ glass })}
        label="Pill glass effect"
        hint="blurs whatever is behind the collapsed box (glass for the whole app is in Appearance → Design)"
        ariaLabel="Pill glass effect"
      />
      </SettingSection>

      <SettingSection title="Behaviour">

      <SettingToggle
        checked={opts.rememberState}
        onChange={(rememberState) => setOpts({ rememberState })}
        label="Reopen it the way you left it"
        hint="opens expanded or collapsed, whichever it was last time"
        ariaLabel="Remember last state"
      />

      <SettingField
        label="Tables while editing"
        htmlFor="composer-table-mode"
        hint="How a table looks in the editor. Read view always shows a rendered table either way."
      >
        <SettingSelect
          id="composer-table-mode"
          value={opts.tableEditMode}
          options={TABLE_MODE_OPTIONS}
          ariaDescribedBy={hintId('composer-table-mode')}
          onChange={(v) => setOpts({ tableEditMode: v as typeof opts.tableEditMode })}
        />
      </SettingField>
      </SettingSection>
    </SettingPanel>
  )
}
