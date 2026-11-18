// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { getViewState, useViewState } from '../../hooks/useViewState'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { useGeneralSettings } from '../../hooks/useGeneralSettings'
import { useNotesContext } from '../../context/NotesContext'
import { useActiveVaultId } from '../../hooks/useVaults'
import { DEFAULT_VAULT_ID } from '../../types'
import { useRag } from '../../hooks/useRag'
import { AiSettingsPanel } from '../../ui/ai/AiSettingsPanel'
import { AdvancedAiPanel } from '../../ui/settings/AdvancedAiPanel'
import { AppearancePanel } from '../../ui/settings/appearance/AppearancePanel'
import { GeneralSettingsPanel } from '../../ui/settings/GeneralSettingsPanel'
import { ComposerSettingsPanel } from '../../ui/settings/ComposerSettingsPanel'
import { ImportExportPanel } from '../../ui/settings/ImportExportPanel'
import { PluginsPanel } from '../../ui/settings/plugins/PluginsPanel'
import { DeveloperPanel } from '../../ui/settings/DeveloperPanel'
import { AboutPanel } from '../../ui/settings/AboutPanel'
import { resolveSettingsTab, type SettingsTab } from './settingsTabs'
import { SettingsSearch } from '../../ui/settings/SettingsSearch'
import { PanelBoundary } from '../../ui/settings/PanelBoundary'
import styles from './Settings.module.css'

type Item = { id: SettingsTab; label: string }

// Grouped by what the user is doing: tune the app, set up AI, then data/extensions/about.
// About trails; Developer follows only when "Show developer options" is on.
type Group = { label?: string; items: Item[] }
const GROUPS: Group[] = [
  {
    label: 'App',
    items: [
      { id: 'general', label: 'General' },
      { id: 'composer', label: 'Quick note' },
      { id: 'appearance', label: 'Appearance' },
    ],
  },
  {
    label: 'AI',
    items: [
      { id: 'ai', label: 'AI setup' },
      { id: 'advanced-ai', label: 'How the AI answers' },
    ],
  },
  {
    items: [
      { id: 'data', label: 'Backup & export' },
      { id: 'plugins', label: 'Plugins' },
      { id: 'about', label: 'About' },
    ],
  },
]
const DEV_GROUP: Group = { items: [{ id: 'developer', label: 'Developer' }] }

function Settings() {
  const navigate = useNavigate()
  const location = useLocation()
  const [general] = useGeneralSettings()
  const showDev = general.showDeveloperOptions
  // The URL is the source of truth; the view-state tab only remembers where bare
  // /settings should reopen (session-sticky).
  const [stickyTab, setStickyTab] = useViewState<SettingsTab>('settings.tab', 'general')
  const bare = location.pathname.replace(/\/+$/, '') === '/settings'
  const requested = bare ? stickyTab : resolveSettingsTab(location.pathname)
  const tab: SettingsTab = requested === 'developer' && !showDev ? 'general' : requested

  useEffect(() => {
    if (bare) navigate('/settings/' + tab, { replace: true })
    else setStickyTab(tab)
  }, [bare, tab, navigate, setStickyTab])

  const groups = showDev ? [...GROUPS, DEV_GROUP] : GROUPS
  const title = groups.flatMap((g) => g.items).find((i) => i.id === tab)?.label

  const { notes: allNotes } = useNotesContext()
  const { config, updateConfig, stats, indexing, stale, reindexAll, refreshStaleness } = useRag()

  // Indexing is vault-scoped like every other note surface: "Index all notes",
  // the staleness count and the reindex target all mean *this vault's* notes.
  // Another vault's vectors stay put — retrieval already filters them out.
  const activeVaultId = useActiveVaultId()
  const notes = useMemo(
    () => allNotes.filter((n) => (n.vaultId ?? DEFAULT_VAULT_ID) === activeVaultId),
    [allNotes, activeVaultId],
  )

  useEffect(() => {
    void refreshStaleness(notes)
  }, [notes, config.enabled, refreshStaleness])

  const goBack = () => navigate(getViewState<string>('settings.returnTo') ?? '/')

  // Esc = Back, but never while typing: a focused field just loses focus.
  // (useEscapeKey already skips open dialogs and keys a menu/search handled.)
  useEscapeKey(() => {
    const el = document.activeElement as HTMLElement | null
    if (el?.matches('input, textarea, select, [contenteditable]')) return el.blur()
    goBack()
  })

  return (
    <div className={styles.settings}>
      {/* Same two columns as the shell below: back + title over the nav,
          search over the content (left edge shared with the panel title). */}
      <header className={styles.header}>
        <div className={styles.headNav}>
          <button type="button" className={styles.backBtn} onClick={goBack} title="Back" aria-label="Back">
            <ArrowLeft size={16} aria-hidden />
          </button>
          <h1 className={styles.title}>Settings</h1>
        </div>
        <SettingsSearch />
      </header>

      <div className={styles.shell}>
        <nav className={styles.subNav} aria-label="Settings sections">
          {groups.map((g) => (
            <div key={g.label ?? g.items[0].id} className={styles.group}>
              {g.label && <p className={styles.groupLabel}>{g.label}</p>}
              {g.items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.navItem} ${tab === s.id ? styles.navItemActive : ''}`}
                  aria-current={tab === s.id ? 'page' : undefined}
                  onClick={() => navigate('/settings/' + s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.content}>
          <h2 className={styles.panelTitle}>{title}</h2>
          <PanelBoundary key={tab}>
          {tab === 'general' && <GeneralSettingsPanel />}
          {tab === 'composer' && <ComposerSettingsPanel />}
          {tab === 'appearance' && <AppearancePanel />}
          {tab === 'ai' && (
            <AiSettingsPanel
              config={config}
              onChange={updateConfig}
              stats={stats}
              indexing={indexing}
              notes={notes}
              staleNotes={stale}
              onReindex={reindexAll}
            />
          )}
          {tab === 'advanced-ai' && <AdvancedAiPanel config={config} updateConfig={updateConfig} />}
          {tab === 'data' && <ImportExportPanel />}
          {tab === 'plugins' && <PluginsPanel />}
          {tab === 'developer' && <DeveloperPanel />}
          {tab === 'about' && <AboutPanel />}
          </PanelBoundary>
        </div>
      </div>
    </div>
  )
}

export default Settings
