// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useGeneralSettings } from '../../hooks/useGeneralSettings'
import { useDashboardPrefs } from '../../views/home/dashboard/useDashboardPrefs'
import type { SuggestionSource } from '../../core/graph/suggestedLinks'
import { SettingSelect, SettingToggle, type SelectOption } from './SettingControls'
import { SettingActionRow, SettingButton, SettingField, SettingPanel, SettingSection, hintId } from './SettingLayout'
import { replayOnboarding } from '../../hooks/useOnboarding'

const STARTUP_OPTIONS: SelectOption[] = [
  { value: 'last', label: 'Last view I was on' },
  { value: '/', label: 'Home' },
  { value: '/notes', label: 'Notes' },
  { value: '/ai', label: 'AI' },
  { value: '/graph', label: 'Graph' },
  { value: '/workspaces', label: 'Workspaces' },
]

const DATE_OPTIONS: SelectOption[] = [
  { value: 'locale', label: 'System default' },
  { value: 'iso', label: '2026-03-09 (ISO)' },
  { value: 'us', label: '3/9/2026 (US)' },
  { value: 'eu', label: '9/3/2026 (EU)' },
]

const WEEK_OPTIONS: SelectOption[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
]

const RETENTION_OPTIONS: SelectOption[] = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '0', label: 'Forever' },
]

const SOURCE_OPTIONS: SelectOption[] = [
  { value: 'tags', label: 'Shared tags' },
  { value: 'ai', label: 'AI — related text' },
]

/** Settings → General: app-wide behaviour (startup, delete safety, dates, Home dashboard). */
export function GeneralSettingsPanel() {
  const [opts, setOpts] = useGeneralSettings()
  const prefs = useDashboardPrefs()

  return (
    <SettingPanel>
      <SettingSection title="Startup & notes">
        <SettingField label="On launch, open" htmlFor="general-startup" hint={'"Last view" reopens wherever you left off.'}>
          <SettingSelect
            id="general-startup"
            ariaDescribedBy={hintId('general-startup')}
            value={opts.startupView}
            options={STARTUP_OPTIONS}
            onChange={(v) => setOpts({ startupView: v as typeof opts.startupView })}
          />
        </SettingField>

        <SettingToggle
          checked={opts.confirmBeforeDelete}
          onChange={(confirmBeforeDelete) => setOpts({ confirmBeforeDelete })}
          label="Confirm before deleting a note"
          hint="show a prompt so a stray click can't erase a note"
          ariaLabel="Confirm before deleting a note"
        />

        <SettingField
          label="Keep deleted notes for"
          htmlFor="general-trash-retention"
          hintVisible
          hint="Notes in Trash are permanently deleted after this long. Restore them any time before then."
        >
          <SettingSelect
            id="general-trash-retention"
            ariaDescribedBy={hintId('general-trash-retention')}
            value={String(opts.trashRetentionDays)}
            options={RETENTION_OPTIONS}
            onChange={(v) => setOpts({ trashRetentionDays: Number(v) })}
          />
        </SettingField>
      </SettingSection>

      <SettingSection title="Dates">
        <SettingField label="Date format" htmlFor="general-dateformat">
          <SettingSelect
            id="general-dateformat"
            value={opts.dateFormat}
            options={DATE_OPTIONS}
            onChange={(v) => setOpts({ dateFormat: v as typeof opts.dateFormat })}
          />
        </SettingField>

        <SettingField label="Week starts on" htmlFor="general-weekstart">
          <SettingSelect
            id="general-weekstart"
            value={opts.weekStart}
            options={WEEK_OPTIONS}
            onChange={(v) => setOpts({ weekStart: v as typeof opts.weekStart })}
          />
        </SettingField>
      </SettingSection>

      <SettingSection
        title="Home dashboard"
        intro="Widget visibility and arrangement live on the dashboard itself, under Customize."
      >
        <SettingField
          label="Suggested links from"
          htmlFor="dashboard-suggest-source"
          hintVisible
          hint="Where the Suggested links tile (and its dashed graph lines) gets pairs. Shared tags always works; AI pairs notes with similar meaning and needs AI on with notes indexed."
        >
          <SettingSelect
            id="dashboard-suggest-source"
            ariaDescribedBy={hintId('dashboard-suggest-source')}
            value={prefs.suggestSource}
            options={SOURCE_OPTIONS}
            onChange={(v) => prefs.setSuggestSource(v as SuggestionSource)}
          />
        </SettingField>
      </SettingSection>

      <SettingSection title="Widget button">
        <SettingToggle
          checked={opts.showWidgetButton}
          onChange={(showWidgetButton) => setOpts({ showWidgetButton })}
          label="Show the widget button"
          hint="the round puzzle button, bottom-right; when off, open widgets from the command palette"
          ariaLabel="Show the widget button"
        />
        <SettingToggle
          checked={opts.autoHideWidgetButton}
          onChange={(autoHideWidgetButton) => setOpts({ autoHideWidgetButton })}
          label="Auto-hide the widget button while typing"
          hint="hidden while a text field or the editor has focus"
          ariaLabel="Auto-hide the widget button while typing"
          disabled={!opts.showWidgetButton}
        />
      </SettingSection>

      <SettingSection title="Welcome tour" intro="Walk through Jnana's basics again. Your earlier answers are kept.">
        <SettingActionRow label="Welcome tour">
          <SettingButton onClick={replayOnboarding}>Replay the tour</SettingButton>
        </SettingActionRow>
      </SettingSection>

      <SettingSection title="Advanced">
        <SettingToggle
          checked={opts.showDeveloperOptions}
          onChange={(showDeveloperOptions) => setOpts({ showDeveloperOptions })}
          label="Show developer options"
          hint="reveals the Developer tab, AI metrics and unfinished experimental options"
          ariaLabel="Show developer options"
        />
      </SettingSection>
    </SettingPanel>
  )
}
