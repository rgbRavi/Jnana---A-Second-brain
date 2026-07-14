// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { FileArchive, Search, Download, Check } from 'lucide-react'
import {
  readZipManifest,
  installPluginZip,
  loadInstalledPlugin,
  listInstalledPlugins,
} from '../../../core/plugins/loader'
import { fetchPluginCatalog, installFromUrl, isNewerVersion, DEFAULT_CATALOG_URL, type CatalogEntry } from '../../../core/plugins/catalog'
import { confirmPluginInstall } from './consent'
import { setPluginSubview, useCatalogUrl, setCatalogUrl } from './usePluginManager'
import { toast } from '../../../lib/toast'
import Styles from './PluginsPanel.module.css'

export function BrowsePlugins() {
  const catalogUrl = useCatalogUrl()
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installedVersions, setInstalledVersions] = useState<Record<string, string>>({})

  const refreshInstalled = useCallback(() => {
    void listInstalledPlugins().then((list) =>
      setInstalledVersions(Object.fromEntries(list.map((p) => [p.id, p.version]))),
    )
  }, [])

  useEffect(() => {
    refreshInstalled()
  }, [refreshInstalled])

  const fetchCatalog = async () => {
    if (!catalogUrl.trim()) return
    setLoading(true)
    setError(null)
    try {
      setEntries(await fetchPluginCatalog(catalogUrl.trim()))
    } catch (err) {
      setError(String(err))
      setEntries(null)
    } finally {
      setLoading(false)
    }
  }

  // Auto-load the (default) registry once when Browse opens, so approved plugins
  // appear without the user pressing Fetch.
  useEffect(() => {
    if (catalogUrl.trim() && entries === null && !loading) void fetchCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const install = async (entry: CatalogEntry) => {
    const granted = await confirmPluginInstall(entry)
    if (!granted) return
    try {
      const info = await installFromUrl(entry.downloadUrl, granted)
      const ok = await loadInstalledPlugin(info)
      toast.success(ok ? `Installed ${info.name}.` : `Installed ${info.name}, but it failed to load (see Developer → console).`)
      refreshInstalled()
    } catch (err) {
      toast.error('Install failed: ' + String(err))
    }
  }

  const importZip = async () => {
    const zip = await open({ filters: [{ name: 'Plugin package', extensions: ['zip'] }] })
    if (typeof zip !== 'string') return
    try {
      const manifest = await readZipManifest(zip)
      const granted = await confirmPluginInstall(manifest)
      if (!granted) return
      const info = await installPluginZip(zip, granted)
      const ok = await loadInstalledPlugin(info)
      toast.success(ok ? `Installed ${info.name}.` : `Installed ${info.name}, but it failed to load.`)
      setPluginSubview('installed')
    } catch (err) {
      toast.error('Install failed: ' + String(err))
    }
  }

  return (
    <div className={Styles.browse}>
      <div className={Styles.urlRow}>
        <input
          className={Styles.urlInput}
          placeholder="Catalog URL (https://… or a local catalog.json path)"
          value={catalogUrl}
          onChange={(e) => setCatalogUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchCatalog()}
        />
        <button className={Styles.subnavItem} onClick={fetchCatalog} disabled={loading || !catalogUrl.trim()}>
          <Search size={15} /> {loading ? 'Fetching…' : 'Fetch'}
        </button>
        <button className={Styles.subnavItem} onClick={importZip} title="Install from a local .zip">
          <FileArchive size={15} /> Import .zip
        </button>
        {catalogUrl !== DEFAULT_CATALOG_URL && (
          <button
            className={Styles.linkBtn}
            onClick={() => setCatalogUrl(DEFAULT_CATALOG_URL)}
            title="Use the official JnanaApp registry"
          >
            Reset to default
          </button>
        )}
      </div>

      {error && <p className={Styles.errorText}>Couldn't load catalog: {error}</p>}

      {entries === null && !error && (
        <p className={Styles.footNote}>
          Enter a community catalog URL (a JSON index) and Fetch to browse installable plugins — or
          install a local <code>.zip</code> directly.
        </p>
      )}

      {entries && entries.length === 0 && <p className={Styles.footNote}>This catalog lists no plugins.</p>}

      {entries && entries.length > 0 && (
        <div className={Styles.list}>
          {entries.map((entry) => {
            const have = installedVersions[entry.id]
            const upgradable = have && isNewerVersion(entry.version, have)
            return (
              <div key={entry.id} className={Styles.card}>
                <div className={Styles.cardMain}>
                  <div className={Styles.cardHead}>
                    <span className={Styles.cardName}>{entry.name}</span>
                    <span className={Styles.version}>v{entry.version}</span>
                    {entry.author && <span className={Styles.muted}>· {entry.author}</span>}
                  </div>
                  <div className={Styles.cardMeta}>
                    {entry.description && <span>{entry.description}</span>}
                    {entry.permissions.length > 0 && (
                      <span className={Styles.muted}>· Permissions: {entry.permissions.join(', ')}</span>
                    )}
                  </div>
                </div>
                <div className={Styles.cardActions}>
                  {have && !upgradable ? (
                    <span className={Styles.installedTag}>
                      <Check size={14} /> Installed
                    </span>
                  ) : (
                    <button className={Styles.installBtn} onClick={() => install(entry)}>
                      <Download size={14} /> {upgradable ? 'Update' : 'Install'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
