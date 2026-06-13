import { useEffect, useState } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import { useRag } from '../../hooks/useRag'
import { AiSettingsPanel } from '../../ui/ai/AiSettingsPanel'
import { AiChat } from '../../ui/ai/AiChat'
import { NoteModal } from '../../ui/NoteModal'
import styles from '../../ui/ai/Ai.module.css'

function Ai() {
  const { notes, update, updateTags } = useNotesContext()
  const { config, updateConfig, stats, indexing, reindexAll } = useRag()
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openNote = notes.find((n) => n.id === openNoteId)

  // Esc closes the settings modal (backdrop click is handled on the overlay).
  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSettingsOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  return (
    <div className={`ai-view ${styles.view}`}>
      <div className={styles.header}>
        <p className="section-label">AI Analyzer</p>
        <button
          className={styles.settingsBtn}
          onClick={() => setSettingsOpen(true)}
          title="AI settings"
        >
          <span className={`${styles.statusDot} ${config.enabled ? styles.statusOn : ''}`}>
            {config.enabled ? `● ${config.provider}` : '○ disabled'}
          </span>
          ⚙ AI Quick Settings
        </button>
      </div>

      <div className={styles.wrap}>
        <AiChat config={config} notes={notes} onOpenNote={setOpenNoteId} />
      </div>

      {settingsOpen && (
        <div className={styles.modalOverlay} onClick={() => setSettingsOpen(false)}>
          <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.modalClose}
              onClick={() => setSettingsOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
            <h2 className={styles.modalTitle}>AI settings</h2>
            <AiSettingsPanel
              config={config}
              onChange={updateConfig}
              stats={stats}
              indexing={indexing}
              notes={notes}
              onReindex={reindexAll}
            />
          </div>
        </div>
      )}

      {openNote && (
        <NoteModal
          note={openNote}
          isOpen={!!openNoteId}
          onClose={() => setOpenNoteId(null)}
          onUpdate={update}
          onUpdateTags={updateTags}
        />
      )}
    </div>
  )
}

export default Ai
