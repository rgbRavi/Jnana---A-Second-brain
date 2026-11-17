// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import { openLogsDir } from '../../../core/data'
import { log } from '../../../lib/logger'
import { open, save } from '@tauri-apps/plugin-dialog'
import { FilePlus2, FolderInput, Package, RotateCw, ScrollText, Trash } from 'lucide-react'
import { reloadAllPlugins } from '../../../plugins'
import { scaffoldPlugin } from '../../../core/plugins/manager'
import {
  readLocalManifest,
  installPlugin,
  loadInstalledPlugin,
  packagePlugin,
} from '../../../core/plugins/loader'
import { confirmPluginInstall } from './consent'
import { clearPluginLog } from '../../../lib/pluginLog'
import { usePluginLog, setPluginSubview } from './usePluginManager'
import { showPromptDialog } from '../../../lib/dialog'
import { toast } from '../../../lib/toast'
import Styles from './PluginsPanel.module.css'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function DeveloperTools() {
  const logEntries = usePluginLog()
  // One tool flow at a time: a second click while a dialog/consent is open is ignored.
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const createPlugin = async () => {
    const name = await showPromptDialog({
      title: 'Create plugin',
      message: 'A starter folder (manifest + entry module + README) will be scaffolded.',
      placeholder: 'My Plugin',
      confirmLabel: 'Choose folder…',
    })
    if (!name) return
    const id = slugify(name)
    if (!id) {
      toast.error('Use at least one letter or number in the name.')
      return
    }
    try {
      const dir = await open({ directory: true, title: 'Where to create the plugin folder' })
      if (typeof dir !== 'string') return
      const created = await scaffoldPlugin(dir, id, name)
      toast.success(`Created plugin at ${created}`)
    } catch (err) {
      log.error('plugin scaffold failed', err)
      toast.error("Couldn't create the plugin. Check that the folder is writable and try again.")
    }
  }

  const loadLocal = async () => {
    try {
      const dir = await open({ directory: true, title: 'Select an unpacked plugin folder' })
      if (typeof dir !== 'string') return
      const manifest = await readLocalManifest(dir)
      if (!(await confirmPluginInstall(manifest))) return
      const info = await installPlugin(manifest.consentToken)
      const ok = await loadInstalledPlugin(info)
      toast.success(ok ? `Loaded ${info.name}.` : `Installed ${info.name}, but it failed to load (see console below).`)
      setPluginSubview('installed')
    } catch (err) {
      log.error('local plugin load failed', err)
      toast.error("Couldn't load this plugin. Check that the folder has a valid plugin manifest.")
    }
  }

  const packagePluginFolder = async () => {
    try {
      const src = await open({ directory: true, title: 'Select the plugin folder to package' })
      if (typeof src !== 'string') return
      const dest = await save({
        title: 'Save plugin package',
        defaultPath: 'plugin.zip',
        filters: [{ name: 'Zip', extensions: ['zip'] }],
      })
      if (typeof dest !== 'string') return
      const out = await packagePlugin(src, dest)
      toast.success(`Packaged to ${out}`)
    } catch (err) {
      log.error('plugin package failed', err)
      toast.error("Couldn't package the plugin. Check the folder and try again.")
    }
  }

  const viewLogs = async () => {
    try {
      await openLogsDir()
    } catch (err) {
      log.error('open logs dir failed', err)
      toast.error("Couldn't open the log folder.")
    }
  }

  const reload = async () => {
    try {
      await reloadAllPlugins()
      toast.success('Plugins reloaded.')
    } catch (err) {
      log.error('plugin reload failed', err)
      toast.error("Couldn't reload plugins. Restart Jnana if something looks off.")
    }
  }

  return (
    <div className={Styles.dev}>
      <div className={Styles.toolGrid}>
        <button className={Styles.tool} onClick={() => void run(createPlugin)} disabled={busy}>
          <FilePlus2 size={16} />
          <span>Create Plugin</span>
          <small>Scaffold a new plugin project</small>
        </button>

        <button className={Styles.tool} onClick={() => void run(packagePluginFolder)} disabled={busy}>
          <Package size={16} />
          <span>Package Plugin</span>
          <small>Zip a built plugin for distribution</small>
        </button>

        <button className={Styles.tool} onClick={() => void run(loadLocal)} disabled={busy}>
          <FolderInput size={16} />
          <span>Load Local Plugin</span>
          <small>Install an unpacked plugin folder</small>
        </button>

        <button className={Styles.tool} onClick={() => void run(reload)} disabled={busy}>
          <RotateCw size={16} />
          <span>Reload</span>
          <small>Re-register built-in and installed plugins</small>
        </button>

        <button className={Styles.tool} onClick={() => void run(viewLogs)} disabled={busy}>
          <ScrollText size={16} />
          <span>View Logs</span>
          <small>Open the app log folder</small>
        </button>
      </div>

      <div className={Styles.consoleHead}>
        <h3 className={Styles.subHeading}>Plugin console</h3>
        <button className={Styles.linkBtn} onClick={clearPluginLog} title="Clear console">
          <Trash size={13} /> Clear
        </button>
      </div>
      <div className={Styles.console}>
        {logEntries.length === 0 ? (
          <div className={Styles.consoleEmpty}>No plugin activity yet.</div>
        ) : (
          [...logEntries].reverse().map((e) => (
            <div key={e.id} className={`${Styles.logLine} ${Styles[`log_${e.level}`]}`}>
              <time>{new Date(e.ts).toLocaleTimeString()}</time>
              {e.pluginId && <code>{e.pluginId}</code>}
              <span>{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
