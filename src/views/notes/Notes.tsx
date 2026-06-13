import { useState, useEffect } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import type { Note } from '../../types'
import { NoteCreator } from '../../ui/editor/NoteCreator'
import { NoteItem } from '../../ui/editor/NoteItem'
import { NoteModal } from '../../ui/NoteModal'
import { eventBus } from '../../lib/eventBus'
import { exportNotes } from '../../core/export'

import NoteStyles from './Notes.module.css'

function Notes() {
  const { notes, loading, create, update, remove, updateTags } = useNotesContext()
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const expandedNote = notes.find((note) => note.id === expandedNoteId)

  useEffect(() => {
    const handler = (note: Note) => {
      eventBus.emit('note:opened', note)
      setExpandedNoteId(note.id)
    }
    eventBus.on('note:navigate', handler)
    return () => eventBus.off('note:navigate', handler)
  }, [])

  const handleExportAll = async () => {
    try {
      const n = await exportNotes(notes)
      if (n) alert(`Exported ${n} note${n !== 1 ? 's' : ''} as Markdown.`)
    } catch (err) {
      alert('Export failed: ' + String(err))
    }
  }

  return (
    <div className={NoteStyles.notesContainer}>

      {/* Section for creating new notes */}
      <div className={NoteStyles.composerWrapper}>
        <NoteCreator onCreate={create} onUpdate={update} />
      </div>

      {/* Shows the number of notes */}
      <div className={NoteStyles.notesWrapper}>
        {notes.length > 0 && (
          <div className={NoteStyles.notesHeader}>
            <p className={NoteStyles.sectionLabel}>
              {notes.length} note{notes.length !== 1 ? 's' : ''}
            </p>
            <button className={NoteStyles.exportAllBtn} onClick={handleExportAll}>
              ⤓ Export all
            </button>
          </div>
        )}

        

        {/* This is the list of notes currently available */}
        {loading && <p className={NoteStyles.noteEmpty}>Loading...</p>}
        {!loading && notes.length === 0 && (
          <p className={NoteStyles.noteEmpty}>No notes yet.</p>
        )}
        {notes.map((note) => (
          <NoteItem
            key={note.id}
            note={note}
            onUpdate={update}
            onRemove={remove}
            onExpand={() => { eventBus.emit('note:opened', note); setExpandedNoteId(note.id) }}
          />
        ))}
      </div>
      
      {/* This sections displays the expanded note when clicked from the notes list as a modal */}
      {expandedNote && (
        <NoteModal
          note={expandedNote}
          isOpen={!!expandedNoteId}
          onClose={() => setExpandedNoteId(null)}
          onUpdate={update}
          onUpdateTags={updateTags}
        />
      )}
    </div>
  )
}

export default Notes
