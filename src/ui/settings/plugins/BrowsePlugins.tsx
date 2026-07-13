// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { open } from '@tauri-apps/plugin-dialog'
import { Compass, FileArchive } from 'lucide-react'
import { readZipManifest, installPluginZip, loadInstalledPlugin } from '../../../core/plugins/loader'
import { confirmPluginInstall } from './consent'
import { setPluginSubview } from './usePluginManager'
import { toast } from '../../../lib/toast'
import Styles from './PluginsPanel.module.css'

/**
 * Browse/install subview. The remote community catalog is still a later phase, so
 * the catalog itself is an honest "coming soon" — but **installing from a local
 * `.zip` works today** through the plugin loader.
 */
export function BrowsePlugins() {
  const importZip = async () => {
    const zip = await open({ filters: [{ name: 'Plugin package', extensions: ['zip'] }] })
    if (typeof zip !== 'string') return
    try {
      const manifest = await readZipManifest(zip)
      const granted = await confirmPluginInstall(manifest)
      if (!granted) return
      const info = await installPluginZip(zip, granted)
      const ok = await loadInstalledPlugin(info)
      toast.success(ok ? `Installed ${info.name}.` : `Installed ${info.name}, but it failed to load (see Developer → console).`)
      setPluginSubview('installed')
    } catch (err) {
      toast.error('Install failed: ' + String(err))
    }
  }

  return (
    <div className={Styles.empty}>
      <Compass size={28} className={Styles.emptyIcon} />
      <h3>Community catalog coming soon</h3>
      <p>
        A browsable directory to discover and one-click-install plugins from the internet is on the
        way. In the meantime, you can install a plugin package directly from a local <code>.zip</code>.
      </p>
      <div className={Styles.emptyActions}>
        <button className={Styles.tool} onClick={importZip}>
          <FileArchive size={16} />
          <span>Import from .zip</span>
          <small>Install a local plugin package</small>
        </button>
        <button className={Styles.linkBtn} onClick={() => setPluginSubview('developer')}>
          Go to Developer →
        </button>
      </div>
    </div>
  )
}
