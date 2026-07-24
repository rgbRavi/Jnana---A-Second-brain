// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useComposerOptions } from '../../hooks/useComposerOptions'
import { SettingSelect, SettingSlider, type SelectOption } from './SettingControls'
import styles from './ComposerSettingsPanel.module.css'

const TABLE_MODE_OPTIONS: SelectOption[] = [
  { value: 'widget', label: 'Live table (grid with Edit button)' },
  { value: 'inline', label: 'Raw CSV block' },
]

/** Settings → Composer: appearance & behavior of the floating note composer. */
export function ComposerSettingsPanel() {
  const [opts, setOpts] = useComposerOptions()

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Controls the floating “Click to take a note” composer on the Home and Notes views.
      </p>

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label htmlFor="composer-transparency">Transparency</label>
          <span className={styles.value}>{opts.transparency}%</span>
        </div>
        <SettingSlider
          id="composer-transparency"
          min={0}
          max={100}
          step={5}
          value={opts.transparency}
          ariaLabel="Transparency"
          onChange={(transparency) => setOpts({ transparency })}
        />
        <span className={styles.hint}>How see-through the collapsed pill is (0 = solid, 100 = clear).</span>
      </div>

      <label className={styles.toggle}>
        <input type="checkbox" checked={opts.glass} onChange={(e) => setOpts({ glass: e.target.checked })} />
        <span>
          Glass effect
          <span className={styles.hint}> — frost/blur whatever is behind the pill</span>
        </span>
      </label>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={opts.rememberState}
          onChange={(e) => setOpts({ rememberState: e.target.checked })}
        />
        <span>
          Remember last state
          <span className={styles.hint}> — reopen expanded or collapsed as you left it</span>
        </span>
      </label>

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label htmlFor="composer-table-mode">Tables while editing</label>
        </div>
        <SettingSelect
          id="composer-table-mode"
          value={opts.tableEditMode}
          options={TABLE_MODE_OPTIONS}
          onChange={(v) => setOpts({ tableEditMode: v as typeof opts.tableEditMode })}
        />
        <span className={styles.hint}>
          How a table looks in the editor. Read view always shows a rendered table either way.
        </span>
      </div>
    </div>
  )
}
