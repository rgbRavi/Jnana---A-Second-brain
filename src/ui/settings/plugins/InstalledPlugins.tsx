// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Trash2, Trash, ShieldCheck, ExternalLink, Palette, Search, X } from 'lucide-react'
import { BUILTIN_PLUGINS, setPluginEnabled } from '../../../plugins'
import {
  listInstalledPlugins,
  setInstalledPluginEnabled,
  removeInstalledPlugin,
  type InstalledPlugin,
} from '../../../core/plugins/loader'
import { pluginRegistry } from '../../../lib/pluginRegistry'
import { getNoteTypeById } from '../../../lib/noteTypes'
import {
  pluginStorageUsage,
  pluginStorageOwners,
  clearPluginStorage,
  type PluginStorageUsage,
  type PluginStorageOwner,
} from '../../../core/plugins/manager'
import { useDisabledPlugins } from './usePluginManager'
import { PluginSettingsPane } from './PluginSettingsPane'
import { PluginPermissions } from './PluginPermissions'
import { PluginShortcuts } from './PluginShortcuts'
import { SettingSelect, SettingToggle } from '../SettingControls'
import {
  isSandboxOnly,
  setSandboxOnly,
  subscribeSandboxOnly,
  getSandboxOnlySnapshot,
} from '../../../lib/pluginPolicy'
import { reloadAllPlugins } from '../../../plugins'
import { subscribePluginActivity, getPluginActivity } from '../../../lib/pluginActivity'
import { subscribeContributions, getContributionsVersion } from '../../../lib/pluginContributions'
import { showChoiceDialog, showConfirmDialog } from '../../../lib/dialog'
import { toast } from '../../../lib/toast'
import Styles from './PluginsPanel.module.css'

interface Row {
  id: string
  name: string
  version: string
  sourceLabel: string
  /** What the plugin calls itself in its manifest. Built-ins are utilities. */
  type: 'theme' | 'utility'
  /** Epoch ms; 0 for built-ins, which ship with the app rather than being installed. */
  installedAt: number
  permissions?: string[]
  installed?: InstalledPlugin
}

/** How the list is grouped and ordered. Both are view preferences, so they live
 *  in component state — they don't survive leaving Settings, and shouldn't. */
type TypeFilter = 'all' | 'theme' | 'utility'
type SortBy = 'name' | 'recent'

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'theme', label: 'Themes' },
  { value: 'utility', label: 'Utility' },
]

/** Data left behind by a plugin that no longer exists here. */
function OrphanStorage({ rows, onClear }: { rows: PluginStorageOwner[]; onClear: (id: string) => void }) {
  if (rows.length === 0) return null
  const total = rows.reduce((n, r) => n + r.bytes, 0)
  return (
    <div className={Styles.card}>
      <div className={Styles.cardMain}>
        <div className={Styles.cardHead}>
          <span className={Styles.cardName}>Leftover plugin data</span>
          <span className={Styles.muted}>{formatBytes(total)}</span>
        </div>
        <div className={Styles.cardMeta}>
          <span className={Styles.muted}>
            {rows.length} removed plugin{rows.length === 1 ? '' : 's'} still store data here, and it
            rides every backup: {rows.map((r) => r.pluginId).join(', ')}
          </span>
        </div>
      </div>
      <div className={Styles.cardActions}>
        {rows.map((r) => (
          <button
            key={r.pluginId}
            className={Styles.iconBtn}
            title={`Delete ${r.pluginId}'s leftover data (${formatBytes(r.bytes)})`}
            aria-label={`Delete leftover data from ${r.pluginId}`}
            onClick={() => onClear(r.pluginId)}
          >
            <Trash size={15} />
          </button>
        ))}
      </div>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function InstalledPlugins() {
  const disabled = useDisabledPlugins()
  // Re-render when a plugin registers a settings pane (they arrive asynchronously,
  // after a worker plugin's init) and when its activity counters move.
  useSyncExternalStore(subscribeContributions, getContributionsVersion)
  const activity = useSyncExternalStore(subscribePluginActivity, getPluginActivity)
  const [installed, setInstalled] = useState<InstalledPlugin[]>([])
  const [usage, setUsage] = useState<Record<string, PluginStorageUsage>>({})
  const [owners, setOwners] = useState<PluginStorageOwner[]>([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const sandboxOnly = useSyncExternalStore(subscribeSandboxOnly, getSandboxOnlySnapshot)

  const refreshInstalled = useCallback(() => {
    void listInstalledPlugins()
      .then(setInstalled)
      .catch((e) => console.error('list installed plugins failed', e))
    void pluginStorageOwners()
      .then(setOwners)
      .catch((e) => console.error('list plugin storage owners failed', e))
  }, [])

  const rows: Row[] = [
    ...BUILTIN_PLUGINS.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      sourceLabel: 'Built-in',
      type: 'utility' as const,
      installedAt: 0,
    })),
    ...installed.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      sourceLabel: p.source === 'local' ? 'Local' : 'Installed',
      type: p.type === 'theme' ? ('theme' as const) : ('utility' as const),
      installedAt: p.installedAt ?? 0,
      permissions: p.permissions,
      installed: p,
    })),
  ]

  // Match on what someone would actually type: the name, the id (for the
  // reverse-domain ids third-party plugins use), what it provides, and its
  // permissions — so "network" finds every plugin that can reach the internet.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => {
      const provides = pluginRegistry.noteTypeIdsOf(row.id).map((k) => getNoteTypeById(k)?.label ?? k)
      return [row.name, row.id, row.sourceLabel, ...(row.permissions ?? []), ...provides]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
    // `rows` is rebuilt every render from these two, so depend on them instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, installed, disabled])

  const sorted = useMemo(() => {
    const list = [...visible]
    if (sortBy === 'name') return list.sort((a, b) => a.name.localeCompare(b.name))
    // Newest first. Built-ins have no install date, so they sit at the end rather
    // than pretending to be the oldest thing you installed.
    return list.sort((a, b) => b.installedAt - a.installedAt || a.name.localeCompare(b.name))
  }, [visible, sortBy])

  const themes = sorted.filter((r) => r.type === 'theme')
  const utilities = sorted.filter((r) => r.type !== 'theme')
  // With a filter on, one unlabelled list reads better than a section of one.
  const groups: { key: TypeFilter; label: string; rows: Row[] }[] =
    typeFilter === 'all'
      ? [
          { key: 'theme' as const, label: 'Themes', rows: themes },
          { key: 'utility' as const, label: 'Utility', rows: utilities },
        ].filter((g) => g.rows.length > 0)
      : [{ key: typeFilter, label: '', rows: typeFilter === 'theme' ? themes : utilities }]

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
    // Its stored data outlives the install, and once the plugin is gone there is no
    // row left to clear it from — so the choice has to be made here, not "later".
    const keys = usage[row.id]?.keys ?? 0
    const choice = keys
      ? await showChoiceDialog({
          title: `Uninstall ${row.name}?`,
          message: `This removes the plugin from disk. It has ${keys} stored key${keys === 1 ? '' : 's'} (${formatBytes(usage[row.id].bytes)}) — once it's uninstalled there's no way to clear that from here.`,
          options: [
            { value: 'purge', label: 'Uninstall and delete its data', primary: true },
            { value: 'keep', label: 'Uninstall, keep its data', description: 'Reinstalling later picks it back up.' },
          ],
        })
      : (await showConfirmDialog({
          title: `Uninstall ${row.name}?`,
          message: 'This removes the plugin from disk.',
          confirmLabel: 'Uninstall',
          danger: true,
        }))
        ? 'keep'
        : null
    if (!choice) return
    try {
      pluginRegistry.unregister(row.id)
      await removeInstalledPlugin(row.id)
      if (choice === 'purge') await clearPluginStorage(row.id)
      toast.success(`Uninstalled ${row.name}.`)
      refreshInstalled()
    } catch (err) {
      toast.error('Uninstall failed: ' + String(err))
    }
  }

  // Rows whose plugin is neither installed nor built in — nothing else in the UI
  // can reach these, so they'd otherwise sit in the DB forever.
  const orphans = useMemo(() => {
    const live = new Set([...BUILTIN_PLUGINS.map((p) => p.id), ...installed.map((p) => p.id)])
    return owners.filter((o) => !live.has(o.pluginId) && o.keys > 0)
  }, [owners, installed])

  const clearOrphan = async (pluginId: string) => {
    const ok = await showConfirmDialog({
      title: `Delete leftover data from ${pluginId}?`,
      message: 'That plugin is no longer installed. This permanently deletes what it stored.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await clearPluginStorage(pluginId)
      toast.success('Leftover data deleted.')
      refreshInstalled()
    } catch (err) {
      toast.error('Failed to delete: ' + String(err))
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
      <div className={Styles.urlRow}>
        <div className={Styles.searchWrap}>
          <Search size={14} className={Styles.searchIcon} />
          <input
            className={Styles.searchInput}
            type="search"
            placeholder="Search plugins by name, id, permission…"
            aria-label="Search installed plugins"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className={Styles.searchClear}
              onClick={() => setQuery('')}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {query && (
          <span className={Styles.muted}>
            {visible.length} of {rows.length}
          </span>
        )}
      </div>

      <div className={Styles.filterRow}>
        <div className={Styles.segmented} role="group" aria-label="Filter plugins by type">
          {TYPE_FILTERS.map((f) => {
            const count = f.value === 'all' ? sorted.length : f.value === 'theme' ? themes.length : utilities.length
            return (
              <button
                key={f.value}
                type="button"
                className={`${Styles.segment} ${typeFilter === f.value ? Styles.segmentActive : ''}`}
                aria-pressed={typeFilter === f.value}
                onClick={() => setTypeFilter(f.value)}
              >
                {f.label} <span className={Styles.segmentCount}>{count}</span>
              </button>
            )
          })}
        </div>
        <SettingSelect
          value={sortBy}
          onChange={(v) => setSortBy(v as SortBy)}
          options={[
            { value: 'name', label: 'Name (A–Z)' },
            { value: 'recent', label: 'Recently installed' },
          ]}
          ariaLabel="Sort plugins"
        />
      </div>

      <div className={Styles.policyRow}>
        <div className={Styles.settingsLabel}>
          <span>Only run sandboxed plugins</span>
          <small className={Styles.muted}>
            Refuse third-party plugins that run on the main thread. Sandboxed ones can only do what
            they asked for; main-thread ones have the app's own access. Built-ins are unaffected.
          </small>
        </div>
        <SettingToggle
          checked={sandboxOnly}
          ariaLabel="Only run sandboxed plugins"
          onChange={(v) => {
            setSandboxOnly(v)
            // Applies to what is already loaded, not just the next install.
            void reloadAllPlugins().then(() => {
              refreshInstalled()
              toast.success(v ? 'Main-thread plugins unloaded.' : 'Plugins reloaded.')
            })
          }}
        />
      </div>

      {sorted.length === 0 && (
        <p className={Styles.footNote}>
          {query ? `No plugins match "${query}".` : 'Nothing here yet.'}
        </p>
      )}

      {groups.map((group) => (
        <div key={group.key} className={Styles.group}>
          {group.label && (
            <p className={Styles.sectionLabel}>
              {group.label} <span className={Styles.segmentCount}>{group.rows.length}</span>
            </p>
          )}
          {group.rows.length === 0 && (
            <p className={Styles.footNote}>
              {group.key === 'theme'
                ? 'No theme plugins installed. A theme declares "type": "theme" in its manifest.'
                : 'No utility plugins installed.'}
            </p>
          )}
          {group.rows.map((row) => {
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
                {row.type === 'theme' && (
                  <span className={Styles.typeTag} title="Declares itself a theme — it changes how Jnana looks">
                    <Palette size={12} /> Theme
                  </span>
                )}
                {row.installed?.runtime === 'worker' && (
                  <span
                    className={Styles.sandboxTag}
                    title="Runs in the plugin sandbox — it can only do what it asked for, and Jnana answers"
                  >
                    <ShieldCheck size={12} /> Sandboxed
                  </span>
                )}
                <span className={Styles.badge}>{row.sourceLabel}</span>
                <span className={Styles.version}>v{row.version}</span>
              </div>
              <div className={Styles.cardMeta}>
                {enabled && contributions.length > 0 && (
                  <span>Provides: {contributions.join(', ')} (note type{contributions.length === 1 ? '' : 's'})</span>
                )}
                {!enabled && <span className={Styles.muted}>Disabled</span>}
                {isSandboxOnly() && row.installed && row.installed.runtime !== 'worker' && (
                  <span className={Styles.blocked}>· Blocked: not sandboxed</span>
                )}
                {row.installed?.homepage && (
                  <button
                    className={Styles.linkBtn}
                    onClick={() => void openUrl(row.installed!.homepage)}
                    title={row.installed.homepage}
                  >
                    <ExternalLink size={12} /> Source
                  </button>
                )}
                {u && u.keys > 0 && (
                  <span className={Styles.muted}>
                    · {u.keys} stored key{u.keys === 1 ? '' : 's'} ({formatBytes(u.bytes)})
                  </span>
                )}
                {(() => {
                  // What this plugin has actually done since launch. For a plugin the
                  // app can't confine, being able to see it is the protection.
                  const a = activity[row.id]
                  if (!a || a.reads + a.writes + a.requests + a.ui === 0) return null
                  const parts = [
                    a.reads ? `${a.reads} read${a.reads === 1 ? '' : 's'}` : null,
                    a.writes ? `${a.writes} write${a.writes === 1 ? '' : 's'}` : null,
                    a.requests ? `${a.requests} request${a.requests === 1 ? '' : 's'}` : null,
                    // UI declarations are cheap one at a time; a large number here
                    // is the shape of a plugin redeclaring in a loop.
                    a.ui ? `${a.ui} UI update${a.ui === 1 ? '' : 's'}` : null,
                  ].filter(Boolean)
                  return (
                    <span className={Styles.activity} title="What this plugin has done since Jnana started (details in Developer → Plugin console)">
                      · {parts.join(', ')}
                    </span>
                  )
                })()}
              </div>
              {row.installed && (
                <PluginPermissions plugin={row.installed} onChanged={refreshInstalled} />
              )}
              {enabled && <PluginShortcuts pluginId={row.id} />}
              {enabled && <PluginSettingsPane pluginId={row.id} />}
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
        </div>
      ))}

      {!query && <OrphanStorage rows={orphans} onClear={(id) => void clearOrphan(id)} />}

      <p className={Styles.footNote}>
        Built-in plugins can be disabled but not removed. Install third-party plugins from Browse (a
        <code> .zip</code>) or Developer (a local folder).
      </p>
    </div>
  )
}
