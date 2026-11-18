// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useSyncExternalStore } from 'react'
import { useGeneralSettings } from '../../../hooks/useGeneralSettings'
import { SettingPanel } from '../SettingLayout'
import { SettingTabs, settingTabId, type SettingTabItem } from '../SettingNav'
import {
  usePluginSubview,
  setPluginSubview,
  getCatalogUrl,
  type PluginSubview,
} from './usePluginManager'
import {
  checkPluginUpdates,
  getOutdatedPlugins,
  subscribePluginUpdates,
} from '../../../core/plugins/updates'
import { InstalledPlugins } from './InstalledPlugins'
import { BrowsePlugins } from './BrowsePlugins'
import { PluginUpdates } from './PluginUpdates'
import { DeveloperTools } from './DeveloperTools'
import { plural } from '../../../lib/plural'
import Styles from './PluginsPanel.module.css'

const ID_PREFIX = 'plugins'
const PANEL_ID = 'plugins-panel'

const NAV: { id: PluginSubview; label: string }[] = [
  { id: 'installed', label: 'Installed' },
  { id: 'browse', label: 'Browse' },
  { id: 'updates', label: 'Updates' },
  { id: 'developer', label: 'Plugin development' },
]

/** Settings → Plugins. A sub-nav over the four manager subviews; the active one is
 *  persisted so the panel reopens where you left it. */
export function PluginsPanel() {
  const stored = usePluginSubview()
  const [{ showDeveloperOptions }] = useGeneralSettings()
  // Dev tools only show with developer options on; a stale saved choice falls back.
  const subview = stored === 'developer' && !showDeveloperOptions ? 'installed' : stored
  const outdated = useSyncExternalStore(subscribePluginUpdates, getOutdatedPlugins)

  const items: SettingTabItem<PluginSubview>[] = NAV.filter((n) => n.id !== 'developer' || showDeveloperOptions).map((n) => ({
    ...n,
    anchor: `plugins-${n.id}`,
    ...(n.id === 'updates' ? { count: outdated.length, countLabel: `${plural(outdated.length, 'update')} available` } : {}),
  }))

  // Opening the manager is a natural moment to check (throttled to once a day), so
  // the Updates tab advertises itself instead of waiting to be visited.
  // Once per open; Browse re-checks (forced) when the user commits a different address.
  useEffect(() => {
    void checkPluginUpdates(getCatalogUrl())
  }, [])

  return (
    <SettingPanel>
      <SettingTabs
        items={items}
        value={subview}
        onChange={setPluginSubview}
        ariaLabel="Plugin manager sections"
        idPrefix={ID_PREFIX}
        panelId={PANEL_ID}
      />

      <div
        className={Styles.body}
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={settingTabId(ID_PREFIX, subview)}
      >
        {subview === 'installed' && <InstalledPlugins />}
        {subview === 'browse' && <BrowsePlugins />}
        {subview === 'updates' && <PluginUpdates />}
        {subview === 'developer' && <DeveloperTools />}
      </div>
    </SettingPanel>
  )
}
