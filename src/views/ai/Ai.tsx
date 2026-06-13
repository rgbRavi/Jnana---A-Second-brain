import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useNotesContext } from '../../context/NotesContext'
import { useRag } from '../../hooks/useRag'
import { AiChat } from '../../ui/ai/AiChat'
import { NoteModal } from '../../ui/NoteModal'
import styles from '../../ui/ai/Ai.module.css'

function Ai() {
  const { notes, update, updateTags } = useNotesContext()
  const { config } = useRag()
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const openNote = notes.find((n) => n.id === openNoteId)

  return (
    <div className={`ai-view ${styles.view}`}>
      <div className={styles.header}>
        <p className="section-label">AI Analyzer</p>
        <NavLink to="/settings" className={styles.settingsBtn}>
          <span className={`${styles.statusDot} ${config.enabled ? styles.statusOn : ''}`}>
            {config.enabled ? `● ${config.chatProvider}` : '○ disabled'}
          </span>
          ⚙ Settings
        </NavLink>
      </div>

      <div className={styles.wrap}>
        <AiChat config={config} notes={notes} onOpenNote={setOpenNoteId} />
      </div>

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
