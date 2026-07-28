// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { getViewState } from '../../hooks/useViewState'
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
import { AboutPanel } from '../../ui/settings/AboutPanel'
import { resolveSettingsTab, type SettingsTab } from './settingsTabs'
import styles from './Settings.module.css'

// Ordered by how often a user reaches for each: General & Composer first (daily
// behaviour), Appearance & AI next (frequent tuning), Data/Plugins/About last.
const SECTIONS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'composer', label: 'Composer' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'ai', label: 'AI Providers' },
  { id: 'advanced-ai', label: 'Advanced AI generation' },
  { id: 'data', label: 'Import / Export' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'about', label: 'About' },
]

function Settings() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState<SettingsTab>(() => resolveSettingsTab(location.pathname))

  useEffect(() => {
    setTab(resolveSettingsTab(location.pathname))
  }, [location.pathname])
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

  return (
    <div className={styles.settings}>
      <header className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={goBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <p className="section-label">Settings</p>
      </header>

      <div className={styles.shell}>
        <nav className={styles.subNav}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.navItem} ${tab === s.id ? styles.navItemActive : ''}`}
              onClick={() => setTab(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className={styles.content}>
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
          {tab === 'advanced-ai' && <AdvancedAiPanel />}
          {tab === 'data' && <ImportExportPanel />}
          {tab === 'plugins' && <PluginsPanel />}
          {tab === 'about' && <AboutPanel />}
        </div>
      </div>
    </div>
  )
}

export default Settings
