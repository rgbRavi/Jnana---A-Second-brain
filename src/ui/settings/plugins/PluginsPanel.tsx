// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useSyncExternalStore } from 'react'
import { Boxes, Compass, RefreshCw, Wrench } from 'lucide-react'
import {
  usePluginSubview,
  setPluginSubview,
  useCatalogUrl,
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
import Styles from './PluginsPanel.module.css'

const NAV: { id: PluginSubview; label: string; icon: typeof Boxes }[] = [
  { id: 'installed', label: 'Installed', icon: Boxes },
  { id: 'browse', label: 'Browse', icon: Compass },
  { id: 'updates', label: 'Updates', icon: RefreshCw },
  { id: 'developer', label: 'Developer', icon: Wrench },
]

/** Settings → Plugins. A sub-nav over the four manager subviews; the active one is
 *  persisted so the panel reopens where you left it. */
export function PluginsPanel() {
  const subview = usePluginSubview()
  const catalogUrl = useCatalogUrl()
  const outdated = useSyncExternalStore(subscribePluginUpdates, getOutdatedPlugins)

  // Opening the manager is a natural moment to check (throttled to once a day), so
  // the Updates tab advertises itself instead of waiting to be visited.
  useEffect(() => {
    void checkPluginUpdates(catalogUrl)
  }, [catalogUrl])

  return (
    <div className={Styles.panel}>
      <nav className={Styles.subnav} aria-label="Plugin manager sections">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`${Styles.subnavItem} ${subview === id ? Styles.subnavActive : ''}`}
            onClick={() => setPluginSubview(id)}
            aria-current={subview === id}
          >
            <Icon size={15} />
            {label}
            {id === 'updates' && outdated.length > 0 && (
              <span className={Styles.navCount} aria-label={`${outdated.length} available`}>
                {outdated.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className={Styles.body}>
        {subview === 'installed' && <InstalledPlugins />}
        {subview === 'browse' && <BrowsePlugins />}
        {subview === 'updates' && <PluginUpdates />}
        {subview === 'developer' && <DeveloperTools />}
      </div>
    </div>
  )
}
