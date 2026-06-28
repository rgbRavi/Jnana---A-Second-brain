import { useEffect, useState } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import { useRag } from '../../hooks/useRag'
import { AiSettingsPanel } from '../../ui/ai/AiSettingsPanel'
import { AppearancePanel } from '../../ui/settings/appearance/AppearancePanel'
import { ComposerSettingsPanel } from '../../ui/settings/ComposerSettingsPanel'
import { ImportExportPanel } from '../../ui/settings/ImportExportPanel'
import styles from './Settings.module.css'

type Tab = 'ai' | 'appearance' | 'composer' | 'data'

const TABS: { id: Tab; label: string }[] = [
  { id: 'ai', label: 'AI Providers' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'composer', label: 'Composer' },
  { id: 'data', label: 'Import / Export' },
]

function Settings() {
  const [tab, setTab] = useState<Tab>('ai')
  const { notes } = useNotesContext()
  const { config, updateConfig, stats, indexing, stale, reindexAll, refreshStaleness } = useRag()

  // Recompute "needs (re)indexing" when notes change or AI is toggled on.
  useEffect(() => {
    void refreshStaleness(notes)
  }, [notes, config.enabled, refreshStaleness])

  return (
    <div className={styles.settings}>
      <p className="section-label">Settings</p>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
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
        {tab === 'appearance' && <AppearancePanel />}
        {tab === 'composer' && <ComposerSettingsPanel />}
        {tab === 'data' && <ImportExportPanel />}
      </div>
    </div>
  )
}

export default Settings
