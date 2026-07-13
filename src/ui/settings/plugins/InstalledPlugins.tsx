// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { BUILTIN_PLUGINS, setPluginEnabled } from '../../../plugins'
import { pluginRegistry } from '../../../lib/pluginRegistry'
import { getNoteTypeById } from '../../../lib/noteTypes'
import { pluginStorageUsage, clearPluginStorage, type PluginStorageUsage } from '../../../core/plugins/manager'
import { useDisabledPlugins } from './usePluginManager'
import { showConfirmDialog } from '../../../lib/dialog'
import { toast } from '../../../lib/toast'
import Styles from './PluginsPanel.module.css'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function InstalledPlugins() {
  const disabled = useDisabledPlugins()
  const [usage, setUsage] = useState<Record<string, PluginStorageUsage>>({})

  const refreshUsage = useCallback(() => {
    for (const p of BUILTIN_PLUGINS) {
      void pluginStorageUsage(p.id).then((u) => setUsage((prev) => ({ ...prev, [p.id]: u })))
    }
  }, [])

  useEffect(() => {
    refreshUsage()
  }, [refreshUsage])

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
      refreshUsage()
    } catch (err) {
      toast.error('Failed to clear data: ' + String(err))
    }
  }

  return (
    <div className={Styles.list}>
      {BUILTIN_PLUGINS.map((plugin) => {
        const enabled = !disabled.has(plugin.id)
        const contributions = pluginRegistry
          .noteTypeIdsOf(plugin.id)
          .map((k) => getNoteTypeById(k)?.label ?? k)
        const u = usage[plugin.id]

        return (
          <div key={plugin.id} className={Styles.card}>
            <div className={Styles.cardMain}>
              <div className={Styles.cardHead}>
                <span className={Styles.cardName}>{plugin.name}</span>
                <span className={Styles.badge}>Built-in</span>
                <span className={Styles.version}>v{plugin.version}</span>
              </div>
              <div className={Styles.cardMeta}>
                {enabled && contributions.length > 0 && (
                  <span>Provides: {contributions.join(', ')} (note type{contributions.length === 1 ? '' : 's'})</span>
                )}
                {!enabled && <span className={Styles.muted}>Disabled</span>}
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
                  onClick={() => clearData(plugin.id, plugin.name)}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                role="switch"
                aria-checked={enabled}
                aria-label={enabled ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}
                title={enabled ? 'Enabled' : 'Disabled'}
                className={`${Styles.switch} ${enabled ? Styles.switchOn : ''}`}
                onClick={() => setPluginEnabled(plugin.id, !enabled)}
              >
                <span className={Styles.switchKnob} />
              </button>
            </div>
          </div>
        )
      })}

      <p className={Styles.footNote}>
        Built-in plugins can be disabled but not removed. Installing and removing third-party plugins
        arrives with the plugin loader (see Developer).
      </p>
    </div>
  )
}
