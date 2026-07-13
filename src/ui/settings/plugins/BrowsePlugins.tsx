// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Compass, FileArchive } from 'lucide-react'
import { setPluginSubview } from './usePluginManager'
import Styles from './PluginsPanel.module.css'

/**
 * Browse/install subview. The community catalog and zip install both depend on the
 * plugin loader runtime (a later phase), so this is an honest shell today — it
 * explains what's coming and points at the Developer tools that already work.
 */
export function BrowsePlugins() {
  return (
    <div className={Styles.empty}>
      <Compass size={28} className={Styles.emptyIcon} />
      <h3>Community plugins are coming</h3>
      <p>
        A browsable catalog to install and update plugins from the internet — plus installing from a
        local <code>.zip</code> — arrives with the plugin loader. Until then, you can scaffold and
        iterate on your own plugins from the Developer tab.
      </p>
      <div className={Styles.emptyActions}>
        <button className={Styles.tool} disabled title="Requires the plugin loader (a later phase)">
          <FileArchive size={16} />
          <span>Import from .zip</span>
          <small>Coming soon</small>
        </button>
        <button className={Styles.linkBtn} onClick={() => setPluginSubview('developer')}>
          Go to Developer →
        </button>
      </div>
    </div>
  )
}
