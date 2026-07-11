// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import type { UseThemeApi } from '../../../hooks/useTheme'
import { PresetsTab } from './PresetsTab'
import { DesignTab } from './DesignTab'
import { MotionTab } from './MotionTab'
import { AdvancedTab } from './AdvancedTab'
import styles from './Appearance.module.css'

type EditorTab = 'presets' | 'design' | 'motion' | 'advanced'

const TABS: { id: EditorTab; label: string }[] = [
  { id: 'presets', label: 'Presets' },
  { id: 'design', label: 'Design' },
  { id: 'motion', label: 'Motion' },
  { id: 'advanced', label: 'Advanced' },
]

/** The tab row + tab content, shared by the inline Settings panel and the
 *  popped-out overlay — both just wrap this in their own chrome/top bar. */
export function ThemeEditor({ api }: { api: UseThemeApi }) {
  const [tab, setTab] = useState<EditorTab>('presets')

  return (
    <>
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.tabContent}>
        {tab === 'presets' && <PresetsTab api={api} />}
        {tab === 'design' && <DesignTab api={api} />}
        {tab === 'motion' && <MotionTab api={api} />}
        {tab === 'advanced' && <AdvancedTab api={api} />}
      </div>
    </>
  )
}
