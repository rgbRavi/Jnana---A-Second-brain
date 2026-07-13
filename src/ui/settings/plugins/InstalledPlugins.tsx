// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useState } from 'react'
import { Trash2, Trash } from 'lucide-react'
import { BUILTIN_PLUGINS, setPluginEnabled } from '../../../plugins'
import {
  listInstalledPlugins,
  setInstalledPluginEnabled,
  removeInstalledPlugin,
  type InstalledPlugin,
} from '../../../core/plugins/loader'
import { pluginRegistry } from '../../../lib/pluginRegistry'
import { getNoteTypeById } from '../../../lib/noteTypes'
import { pluginStorageUsage, clearPluginStorage, type PluginStorageUsage } from '../../../core/plugins/manager'
import { useDisabledPlugins } from './usePluginManager'
import { showConfirmDialog } from '../../../lib/dialog'
import { toast } from '../../../lib/toast'
import Styles from './PluginsPanel.module.css'

interface Row {
  id: string
  name: string
  version: string
  sourceLabel: string
  permissions?: string[]
  installed?: InstalledPlugin
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function InstalledPlugins() {
  const disabled = useDisabledPlugins()
  const [installed, setInstalled] = useState<InstalledPlugin[]>([])
  const [usage, setUsage] = useState<Record<string, PluginStorageUsage>>({})

  const refreshInstalled = useCallback(() => {
    void listInstalledPlugins()
      .then(setInstalled)
      .catch((e) => console.error('list installed plugins failed', e))
  }, [])

  const rows: Row[] = [
    ...BUILTIN_PLUGINS.map((p) => ({ id: p.id, name: p.name, version: p.version, sourceLabel: 'Built-in' })),
    ...installed.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      sourceLabel: p.source === 'local' ? 'Local' : 'Installed',
      permissions: p.permissions,
      installed: p,
    })),
  ]

  const refreshUsage = useCallback((ids: string[]) => {
    for (const id of ids) {
      void pluginStorageUsage(id).then((u) => setUsage((prev) => ({ ...prev, [id]: u })))
    }
  }, [])

  useEffect(() => {
    refreshInstalled()
  }, [refreshInstalled])

  useEffect(() => {
    refreshUsage(rows.map((r) => r.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installed])

  const toggle = async (row: Row, enabled: boolean) => {
    if (row.installed) await setInstalledPluginEnabled(row.installed, enabled)
    else setPluginEnabled(row.id, enabled)
  }

  const uninstall = async (row: Row) => {
    const ok = await showConfirmDialog({
      title: `Uninstall ${row.name}?`,
      message: 'This removes the plugin from disk. Data it stored is kept unless you clear it separately.',
      confirmLabel: 'Uninstall',
      danger: true,
    })
    if (!ok) return
    try {
      pluginRegistry.unregister(row.id)
      await removeInstalledPlugin(row.id)
      toast.success(`Uninstalled ${row.name}.`)
      refreshInstalled()
    } catch (err) {
      toast.error('Uninstall failed: ' + String(err))
    }
  }

  const clearData = async (id: string, name: string) => {
    const ok = await showConfirmDialog({
      title: `Clear ${name}'s data?`,
      message: 'This permanently deletes all data this plugin has stored (e.g. review schedules). Note content is not affected.',
      confirmLabel: 'Clear data',
      danger: true,
    })
    if (!ok) return
    try {
      await clearPluginStorage(id)
      toast.success(`Cleared ${name}'s stored data.`)
      refreshUsage([id])
    } catch (err) {
      toast.error('Failed to clear data: ' + String(err))
    }
  }

  return (
    <div className={Styles.list}>
      {rows.map((row) => {
        const enabled = !disabled.has(row.id)
        const contributions = pluginRegistry
          .noteTypeIdsOf(row.id)
          .map((k) => getNoteTypeById(k)?.label ?? k)
        const u = usage[row.id]

        return (
          <div key={row.id} className={Styles.card}>
            <div className={Styles.cardMain}>
              <div className={Styles.cardHead}>
                <span className={Styles.cardName}>{row.name}</span>
                <span className={Styles.badge}>{row.sourceLabel}</span>
                <span className={Styles.version}>v{row.version}</span>
              </div>
              <div className={Styles.cardMeta}>
                {enabled && contributions.length > 0 && (
                  <span>Provides: {contributions.join(', ')} (note type{contributions.length === 1 ? '' : 's'})</span>
                )}
                {!enabled && <span className={Styles.muted}>Disabled</span>}
                {row.permissions && row.permissions.length > 0 && (
                  <span className={Styles.muted}>· Permissions: {row.permissions.join(', ')}</span>
                )}
                {u && u.keys > 0 && (
                  <span className={Styles.muted}>
                    · {u.keys} stored key{u.keys === 1 ? '' : 's'} ({formatBytes(u.bytes)})
                  </span>
                )}
              </div>
            </div>

            <div className={Styles.cardActions}>
              {u && u.keys > 0 && (
                <button
                  className={Styles.iconBtn}
                  title="Clear stored data"
                  aria-label="Clear stored data"
                  onClick={() => clearData(row.id, row.name)}
                >
                  <Trash size={15} />
                </button>
              )}
              {row.installed && (
                <button
                  className={Styles.iconBtn}
                  title="Uninstall plugin"
                  aria-label="Uninstall plugin"
                  onClick={() => uninstall(row)}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                role="switch"
                aria-checked={enabled}
                aria-label={enabled ? `Disable ${row.name}` : `Enable ${row.name}`}
                title={enabled ? 'Enabled' : 'Disabled'}
                className={`${Styles.switch} ${enabled ? Styles.switchOn : ''}`}
                onClick={() => void toggle(row, !enabled)}
              >
                <span className={Styles.switchKnob} />
              </button>
            </div>
          </div>
        )
      })}

      <p className={Styles.footNote}>
        Built-in plugins can be disabled but not removed. Install third-party plugins from Browse (a
        <code> .zip</code>) or Developer (a local folder).
      </p>
    </div>
  )
}
