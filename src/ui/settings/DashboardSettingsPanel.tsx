// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useDashboardPrefs } from '../../views/home/dashboard/useDashboardPrefs'
import type { SuggestionSource } from '../../core/graph/suggestedLinks'
import { SettingSelect, type SelectOption } from './SettingControls'
import styles from './ComposerSettingsPanel.module.css'

const SOURCE_OPTIONS: SelectOption[] = [
  { value: 'tags', label: 'Shared tags' },
  { value: 'ai', label: 'AI — related text' },
]

/** Settings → Dashboard: how the Home dashboard's insight tiles are computed. */
export function DashboardSettingsPanel() {
  const prefs = useDashboardPrefs()

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Controls the Home dashboard. Widget visibility and arrangement live on the dashboard itself,
        under Customize.
      </p>

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label htmlFor="dashboard-suggest-source">Suggested links from</label>
        </div>
        <SettingSelect
          id="dashboard-suggest-source"
          value={prefs.suggestSource}
          options={SOURCE_OPTIONS}
          onChange={(v) => prefs.setSuggestSource(v as SuggestionSource)}
        />
        <span className={styles.hint}>
          Where the “Suggested links” tile — and the dashed lines it highlights in the graph — get
          their pairs. <b>Shared tags</b> pairs notes carrying the same tag and always works.{' '}
          <b>AI</b> pairs notes whose text is semantically close, which needs AI turned on and your
          notes indexed; with AI off the tile stays at zero.
        </span>
      </div>
    </div>
  )
}
