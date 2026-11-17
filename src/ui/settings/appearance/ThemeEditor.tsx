// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { ReactNode } from 'react'
import { useViewState } from '../../../hooks/useViewState'
import type { UseThemeApi } from '../../../hooks/useTheme'
import { SettingTabs, settingTabId, type SettingTabItem } from '../SettingNav'
import { PresetsTab } from './PresetsTab'
import { DesignTab } from './DesignTab'
import { MotionTab } from './MotionTab'
import { AdvancedTab } from './AdvancedTab'
import styles from './Appearance.module.css'

type EditorTab = 'presets' | 'design' | 'motion' | 'advanced'

const TABS: SettingTabItem<EditorTab>[] = [
  { id: 'presets', label: 'Presets', anchor: 'theme-presets' },
  { id: 'design', label: 'Design', anchor: 'theme-design' },
  { id: 'motion', label: 'Motion', anchor: 'theme-motion' },
  { id: 'advanced', label: 'Advanced', anchor: 'theme-advanced' },
]

const ID_PREFIX = 'tstab'

/** The tab row + tab content, shared by the inline Settings panel and the
 *  popped-out overlay. `trailing` = panel-level actions at the tab row's right
 *  (the overlay passes none: its header already has them). */
export function ThemeEditor({ api, trailing }: { api: UseThemeApi; trailing?: ReactNode }) {
  const [tab, setTab] = useViewState<EditorTab>('themeStudio.tab', 'presets')

  return (
    <>
      <SettingTabs
        items={TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="Theme Studio sections"
        idPrefix={ID_PREFIX}
        panelId="tstab-panel"
        trailing={trailing}
      />

      <div className={styles.tabContent} role="tabpanel" id="tstab-panel" aria-labelledby={settingTabId(ID_PREFIX, tab)}>
        {tab === 'presets' && <PresetsTab api={api} />}
        {tab === 'design' && <DesignTab api={api} />}
        {tab === 'motion' && <MotionTab api={api} />}
        {tab === 'advanced' && <AdvancedTab api={api} />}
      </div>
    </>
  )
}
