// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useGeneralSettings } from '../../hooks/useGeneralSettings'
import { SettingSelect, SettingToggle, type SelectOption } from './SettingControls'
import styles from './GeneralSettingsPanel.module.css'

const STARTUP_OPTIONS: SelectOption[] = [
  { value: 'last', label: 'Last view I was on' },
  { value: '/', label: 'Home' },
  { value: '/notes', label: 'Notes' },
  { value: '/search', label: 'Search' },
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

/** Settings → General: app-wide behaviour (startup, delete safety, dates). */
export function GeneralSettingsPanel() {
  const [opts, setOpts] = useGeneralSettings()

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>App-wide behaviour: what opens on launch, delete safety, and how dates display.</p>

      <div className={styles.field}>
        <label htmlFor="general-startup">On launch, open</label>
        <SettingSelect
          id="general-startup"
          value={opts.startupView}
          options={STARTUP_OPTIONS}
          onChange={(v) => setOpts({ startupView: v as typeof opts.startupView })}
        />
        <span className={styles.hint}>"Last view" reopens wherever you left off.</span>
      </div>

      <SettingToggle
        checked={opts.confirmBeforeDelete}
        onChange={(confirmBeforeDelete) => setOpts({ confirmBeforeDelete })}
        label="Confirm before deleting a note"
        hint="show a prompt so a stray click can't erase a note"
        ariaLabel="Confirm before deleting a note"
      />

      <div className={styles.field}>
        <label htmlFor="general-dateformat">Date format</label>
        <SettingSelect
          id="general-dateformat"
          value={opts.dateFormat}
          options={DATE_OPTIONS}
          onChange={(v) => setOpts({ dateFormat: v as typeof opts.dateFormat })}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="general-weekstart">Week starts on</label>
        <SettingSelect
          id="general-weekstart"
          value={opts.weekStart}
          options={WEEK_OPTIONS}
          onChange={(v) => setOpts({ weekStart: v as typeof opts.weekStart })}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="general-trash-retention">Keep deleted notes for</label>
        <SettingSelect
          id="general-trash-retention"
          value={String(opts.trashRetentionDays)}
          options={RETENTION_OPTIONS}
          onChange={(v) => setOpts({ trashRetentionDays: Number(v) })}
        />
        <span className={styles.hint}>Notes in Trash are permanently deleted after this long. Restore them any time before then.</span>
      </div>
    </div>
  )
}
