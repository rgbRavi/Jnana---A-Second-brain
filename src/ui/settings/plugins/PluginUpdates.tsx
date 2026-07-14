// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw, ArrowUpCircle } from 'lucide-react'
import { listInstalledPlugins, loadInstalledPlugin, type InstalledPlugin } from '../../../core/plugins/loader'
import { fetchPluginCatalog, installFromUrl, isNewerVersion, type CatalogEntry } from '../../../core/plugins/catalog'
import { pluginRegistry } from '../../../lib/pluginRegistry'
import { useCatalogUrl } from './usePluginManager'
import { toast } from '../../../lib/toast'
import Styles from './PluginsPanel.module.css'

interface Upgrade {
  installed: InstalledPlugin
  entry: CatalogEntry
}

export function PluginUpdates() {
  const catalogUrl = useCatalogUrl()
  const [upgrades, setUpgrades] = useState<Upgrade[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    if (!catalogUrl.trim()) {
      setUpgrades(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [installed, catalog] = await Promise.all([
        listInstalledPlugins(),
        fetchPluginCatalog(catalogUrl.trim()),
      ])
      const byId = new Map(catalog.map((e) => [e.id, e]))
      const found: Upgrade[] = []
      for (const p of installed) {
        const entry = byId.get(p.id)
        if (entry && isNewerVersion(entry.version, p.version)) found.push({ installed: p, entry })
      }
      setUpgrades(found)
    } catch (err) {
      setError(String(err))
      setUpgrades(null)
    } finally {
      setLoading(false)
    }
  }, [catalogUrl])

  useEffect(() => {
    void check()
  }, [check])

  const update = async (u: Upgrade) => {
    try {
      pluginRegistry.unregister(u.installed.id)
      const info = await installFromUrl(u.entry.downloadUrl, u.installed.granted)
      await loadInstalledPlugin(info)
      toast.success(`Updated ${info.name} to v${info.version}.`)
      void check()
    } catch (err) {
      toast.error('Update failed: ' + String(err))
    }
  }

  const updateAll = async () => {
    for (const u of upgrades ?? []) await update(u)
  }

  if (!catalogUrl.trim()) {
    return (
      <div className={Styles.empty}>
        <CheckCircle2 size={28} className={Styles.emptyIcon} />
        <h3>Set a catalog to check for updates</h3>
        <p>
          Built-in plugins update with Jnana. To check installed third-party plugins for updates, set a
          catalog URL in the Browse tab.
        </p>
      </div>
    )
  }

  if (loading && upgrades === null) return <p className={Styles.footNote}>Checking for updates…</p>
  if (error) return <p className={Styles.errorText}>Couldn't check updates: {error}</p>

  if (!upgrades || upgrades.length === 0) {
    return (
      <div className={Styles.empty}>
        <CheckCircle2 size={28} className={Styles.emptyIcon} />
        <h3>Everything is up to date</h3>
        <p>No installed plugins have a newer version in the catalog.</p>
        <button className={Styles.subnavItem} onClick={() => void check()}>
          <RefreshCw size={14} /> Check again
        </button>
      </div>
    )
  }

  return (
    <div className={Styles.list}>
      <div className={Styles.consoleHead}>
        <span className="section-label">{upgrades.length} update{upgrades.length === 1 ? '' : 's'} available</span>
        <button className={Styles.linkBtn} onClick={updateAll}>
          Update all
        </button>
      </div>
      {upgrades.map((u) => (
        <div key={u.installed.id} className={Styles.card}>
          <div className={Styles.cardMain}>
            <div className={Styles.cardHead}>
              <span className={Styles.cardName}>{u.installed.name}</span>
              <span className={Styles.version}>
                v{u.installed.version} → v{u.entry.version}
              </span>
            </div>
            {u.entry.description && <div className={Styles.cardMeta}>{u.entry.description}</div>}
          </div>
          <div className={Styles.cardActions}>
            <button className={Styles.installBtn} onClick={() => update(u)}>
              <ArrowUpCircle size={14} /> Update
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
