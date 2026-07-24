// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useGeneralSettings } from '../../hooks/useGeneralSettings'
import styles from './GeneralSettingsPanel.module.css'

const STARTUP_OPTIONS: { value: string; label: string }[] = [
  { value: 'last', label: 'Last view I was on' },
  { value: '/', label: 'Home' },
  { value: '/notes', label: 'Notes' },
  { value: '/search', label: 'Search' },
  { value: '/ai', label: 'AI' },
  { value: '/graph', label: 'Graph' },
  { value: '/workspaces', label: 'Workspaces' },
]

/** Settings → General: app-wide behaviour (startup, delete safety, dates). */
export function GeneralSettingsPanel() {
  const [opts, setOpts] = useGeneralSettings()

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>App-wide behaviour: what opens on launch, delete safety, and how dates display.</p>

      <div className={styles.field}>
        <label htmlFor="general-startup">On launch, open</label>
        <select
          id="general-startup"
          className={styles.select}
          value={opts.startupView}
          onChange={(e) => setOpts({ startupView: e.target.value as typeof opts.startupView })}
        >
          {STARTUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className={styles.hint}>"Last view" reopens wherever you left off.</span>
      </div>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={opts.confirmBeforeDelete}
          onChange={(e) => setOpts({ confirmBeforeDelete: e.target.checked })}
        />
        <span>Confirm before deleting a note<span className={styles.hint}> — show a prompt so a stray click can't erase a note.</span></span>
      </label>

      <div className={styles.field}>
        <label htmlFor="general-dateformat">Date format</label>
        <select
          id="general-dateformat"
          className={styles.select}
          value={opts.dateFormat}
          onChange={(e) => setOpts({ dateFormat: e.target.value as typeof opts.dateFormat })}
        >
          <option value="locale">System default</option>
          <option value="iso">2026-03-09 (ISO)</option>
          <option value="us">3/9/2026 (US)</option>
          <option value="eu">9/3/2026 (EU)</option>
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="general-weekstart">Week starts on</label>
        <select
          id="general-weekstart"
          className={styles.select}
          value={opts.weekStart}
          onChange={(e) => setOpts({ weekStart: e.target.value as typeof opts.weekStart })}
        >
          <option value="monday">Monday</option>
          <option value="sunday">Sunday</option>
        </select>
      </div>
    </div>
  )
}
