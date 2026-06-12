import { useState } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import { useRag } from '../../hooks/useRag'
import { AiSettingsPanel } from '../../ui/ai/AiSettingsPanel'
import { ThreadAnalyzer } from '../../ui/ai/ThreadAnalyzer'
import { NoteModal } from '../../ui/NoteModal'
import styles from '../../ui/ai/Ai.module.css'

function Ai() {
  const { notes, update, updateTags } = useNotesContext()
  const { config, updateConfig, stats, indexing, reindexAll } = useRag()
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const openNote = notes.find((n) => n.id === openNoteId)

  return (
    <div className={`ai-view ${styles.view}`}>
      <p className="section-label">AI Analyzer</p>
      <div className={styles.wrap}>
        <AiSettingsPanel
          config={config}
          onChange={updateConfig}
          stats={stats}
          indexing={indexing}
          notes={notes}
          onReindex={reindexAll}
        />
        <ThreadAnalyzer config={config} notes={notes} onOpenNote={setOpenNoteId} />
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
