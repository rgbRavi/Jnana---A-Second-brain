// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useRef, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { FileArchive, Search, Download, Check, ShieldCheck, ExternalLink } from 'lucide-react'
import {
  readZipManifest,
  installPlugin,
  loadInstalledPlugin,
  listInstalledPlugins,
  type InstalledPlugin,
} from '../../../core/plugins/loader'
import {
  fetchPluginCatalog,
  isNewerVersion,
  DEFAULT_CATALOG_URL,
  type CatalogEntry,
} from '../../../core/plugins/catalog'
import { checkPluginUpdates } from '../../../core/plugins/updates'
import { confirmPluginInstall } from './consent'
import { upgradePlugin, isHttpUrl } from './pluginActions'
import { setPluginSubview, useCatalogUrl, setCatalogUrl } from './usePluginManager'
import { toast } from '../../../lib/toast'
import { log } from '../../../lib/logger'
import { SettingButton, settingInputClass } from '../SettingLayout'
import Styles from './PluginsPanel.module.css'

export function BrowsePlugins() {
  const catalogUrl = useCatalogUrl()
  // Typing edits a local draft; the stored address (which drives update checks) only
  // changes on Fetch / Enter / blur, so half-typed hosts are never requested.
  const [draft, setDraft] = useState(catalogUrl)
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installedMap, setInstalledMap] = useState<Record<string, InstalledPlugin>>({})
  const requestRef = useRef(0)
  const busy = installing !== null || importing

  const refreshInstalled = useCallback(() => {
    listInstalledPlugins()
      .then((list) => setInstalledMap(Object.fromEntries(list.map((p) => [p.id, p]))))
      .catch((err) => log.error('list installed plugins failed', err))
  }, [])

  useEffect(() => {
    refreshInstalled()
  }, [refreshInstalled])

  const fetchCatalog = async (url = draft) => {
    const next = url.trim()
    if (!next || loading) return
    const changed = next !== catalogUrl.trim()
    if (next !== catalogUrl) setCatalogUrl(next)
    const token = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const list = await fetchPluginCatalog(next)
      if (token !== requestRef.current) return
      setEntries(list)
      if (changed) void checkPluginUpdates(next, true)
    } catch (err) {
      if (token !== requestRef.current) return
      log.error('plugin catalog fetch failed', err)
      setError(
        String(err).includes('Invalid catalog JSON')
          ? "That address isn't a Jnana plugin catalog."
          : 'Check the address and your connection, then try again.',
      )
      setEntries(null)
    } finally {
      if (token === requestRef.current) setLoading(false)
    }
  }

  // Auto-load the (default) registry once when Browse opens, so approved plugins
  // appear without the user pressing Fetch.
  useEffect(() => {
    if (catalogUrl.trim() && entries === null && !loading) void fetchCatalog(catalogUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Commit on blur only when the field actually changed.
  const commitDraft = () => {
    if (draft.trim() && draft.trim() !== catalogUrl.trim()) void fetchCatalog(draft)
  }

  const install = async (entry: CatalogEntry) => {
    if (busy) return
    setInstalling(entry.id)
    try {
      if ((await upgradePlugin(entry, installedMap[entry.id], { alwaysConfirm: true })) === 'done') refreshInstalled()
    } finally {
      setInstalling(null)
    }
  }

  const importZip = async () => {
    if (busy) return
    setImporting(true)
    try {
      const zip = await open({ filters: [{ name: 'Plugin package', extensions: ['zip'] }] })
      if (typeof zip !== 'string') return
      const manifest = await readZipManifest(zip)
      if (!(await confirmPluginInstall(manifest))) return
      const info = await installPlugin(manifest.consentToken)
      const ok = await loadInstalledPlugin(info)
      toast.success(ok ? `Installed ${info.name}.` : `Installed ${info.name}, but it failed to load.`)
      setPluginSubview('installed')
    } catch (err) {
      log.error('plugin zip install failed', err)
      toast.error("Couldn't install this package. Make sure it is a valid plugin .zip.")
    } finally {
      setImporting(false)
    }
  }

  const openHomepage = (url: string) => {
    if (!isHttpUrl(url)) return
    openUrl(url.trim()).catch((err) => {
      log.error('open plugin homepage failed', err)
      toast.error("Couldn't open the plugin's homepage.")
    })
  }

  return (
    <div className={Styles.browse}>
      <div className={Styles.urlRow}>
        <label htmlFor="plugin-catalog-url" className={Styles.fieldLabel}>Catalog address</label>
        <input
          id="plugin-catalog-url"
          aria-describedby="plugin-catalog-url-hint"
          className={`${settingInputClass} ${Styles.urlInput}`}
          placeholder="https://… or a local catalog.json path"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => e.key === 'Enter' && void fetchCatalog()}
        />
        <SettingButton onClick={() => void fetchCatalog()} busy={loading} disabled={!draft.trim()}>
          <Search size={15} /> {loading ? 'Fetching…' : 'Fetch'}
        </SettingButton>
        <SettingButton onClick={() => void importZip()} busy={importing} disabled={busy} title="Install from a local .zip">
          <FileArchive size={15} /> Import .zip
        </SettingButton>
        {draft !== DEFAULT_CATALOG_URL && (
          <button
            className={Styles.linkBtn}
            onClick={() => {
              setDraft(DEFAULT_CATALOG_URL)
              void fetchCatalog(DEFAULT_CATALOG_URL)
            }}
            title="Use the official JnanaApp registry"
          >
            Reset to default
          </button>
        )}
      </div>

      <p id="plugin-catalog-url-hint" className={Styles.hint}>
        A catalog is a JSON index of plugins. Leave the default to use the official registry.
      </p>

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
          {entries.map((entry, i) => {
            const have = installedMap[entry.id]?.version
            const upgradable = have && isNewerVersion(entry.version, have)
            return (
              <div key={`${entry.id}#${i}`} className={Styles.card}>
                <div className={Styles.cardMain}>
                  <div className={Styles.cardHead}>
                    <span className={Styles.cardName}>{entry.name}</span>
                    {entry.runtime === 'worker' && (
                      <span
                        className={Styles.sandboxTag}
                        title="Runs in the plugin sandbox — it can only do what it asks for, and Jnana answers"
                      >
                        <ShieldCheck size={12} /> Sandboxed
                      </span>
                    )}
                    <span className={Styles.version}>v{entry.version}</span>
                    {entry.author && <span className={Styles.muted}>· {entry.author}</span>}
                  </div>
                  <div className={Styles.cardMeta}>
                    {entry.description && (
                      <span className={Styles.clamp3} title={entry.description}>
                        {entry.description}
                      </span>
                    )}
                    {entry.permissions.length > 0 && (
                      <span className={Styles.muted}>· Asks to: {entry.permissions.join(', ')}</span>
                    )}
                    {isHttpUrl(entry.homepage) && (
                      <button
                        className={Styles.linkBtn}
                        onClick={() => openHomepage(entry.homepage as string)}
                        title={entry.homepage}
                      >
                        <ExternalLink size={12} /> Source
                      </button>
                    )}
                  </div>
                </div>
                <div className={Styles.cardActions}>
                  {have && !upgradable ? (
                    <span className={Styles.installedTag}>
                      <Check size={14} /> Installed
                    </span>
                  ) : (
                    <SettingButton variant="primary" busy={installing === entry.id} disabled={busy} onClick={() => void install(entry)}>
                      <Download size={14} /> {upgradable ? 'Update' : 'Install'}
                    </SettingButton>
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
