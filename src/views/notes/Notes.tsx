import { useState, useEffect } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import type { Note } from '../../types'
import { NoteItem } from '../../ui/editor/NoteItem'
import { NoteModal } from '../../ui/NoteModal'
import { eventBus } from '../../lib/eventBus'
import { exportNotes } from '../../core/export'
import { toast } from '../../lib/toast'

import NoteStyles from './Notes.module.css'

function Notes() {
  const { notes, loading, error, update, remove, updateTags } = useNotesContext()
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
      if (n) toast.success(`Exported ${n} note${n !== 1 ? 's' : ''} as Markdown.`)
    } catch (err) {
      toast.error('Export failed: ' + String(err))
    }
  }

  return (
    <div className={NoteStyles.notesContainer}>

      {/* The note composer floats at the bottom (mounted app-level in AppLayout). */}

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
        {!loading && error && <p className={NoteStyles.noteEmpty}>{error}</p>}
        {!loading && !error && notes.length === 0 && (
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
