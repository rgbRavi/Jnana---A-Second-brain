// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { FilePlus2, FolderInput, Package, RotateCw, ScrollText, Trash } from 'lucide-react'
import { reloadBuiltinPlugins } from '../../../plugins'
import { scaffoldPlugin } from '../../../core/plugins/manager'
import { clearPluginLog } from '../../../lib/pluginLog'
import { usePluginLog } from './usePluginManager'
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
      toast.error('Please enter a name with at least one letter or digit.')
      return
    }
    const dir = await open({ directory: true, title: 'Where to create the plugin folder' })
    if (typeof dir !== 'string') return
    try {
      const created = await scaffoldPlugin(dir, id, name)
      toast.success(`Created plugin at ${created}`)
    } catch (err) {
      toast.error('Scaffold failed: ' + String(err))
    }
  }

  const viewLogs = async () => {
    try {
      await invoke('open_logs_dir')
    } catch (err) {
      toast.error('Could not open logs: ' + String(err))
    }
  }

  const reload = () => {
    reloadBuiltinPlugins()
    toast.success('Plugins reloaded.')
  }

  return (
    <div className={Styles.dev}>
      <div className={Styles.toolGrid}>
        <button className={Styles.tool} onClick={createPlugin}>
          <FilePlus2 size={16} />
          <span>Create Plugin</span>
          <small>Scaffold a new plugin project</small>
        </button>

        <button
          className={Styles.tool}
          disabled
          title="Requires the plugin loader (a later phase)"
        >
          <Package size={16} />
          <span>Package Plugin</span>
          <small>Zip a built plugin for distribution</small>
        </button>

        <button
          className={Styles.tool}
          disabled
          title="Requires the plugin loader (a later phase)"
        >
          <FolderInput size={16} />
          <span>Load Local Plugin</span>
          <small>Run an unpacked plugin folder</small>
        </button>

        <button className={Styles.tool} onClick={reload}>
          <RotateCw size={16} />
          <span>Reload</span>
          <small>Re-register all plugins</small>
        </button>

        <button className={Styles.tool} onClick={viewLogs}>
          <ScrollText size={16} />
          <span>View Logs</span>
          <small>Open the app log folder</small>
        </button>
      </div>

      <div className={Styles.consoleHead}>
        <span className="section-label">Plugin console</span>
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
