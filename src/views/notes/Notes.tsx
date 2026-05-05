import { useState } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import { NoteCreator } from '../../ui/editor/NoteCreator'
import { NoteItem } from '../../ui/editor/NoteItem'
import { NoteModal } from '../../ui/NoteModal'
import { eventBus } from '../../lib/eventBus'

import NoteStyles from './Notes.module.css'

function Notes() {
  const { notes, loading, create, update, remove, updateTags } = useNotesContext()
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const expandedNote = notes.find((note) => note.id === expandedNoteId)

  return (
    <div className={NoteStyles.notesContainer}>
      <div className={NoteStyles.composerWrapper}>
        <NoteCreator onCreate={create} onUpdate={update} />
      </div>

      <div className={NoteStyles.notesWrapper}>
        {notes.length > 0 && (
          <p className={NoteStyles.sectionLabel}>
            {notes.length} note{notes.length !== 1 ? 's' : ''}
          </p>
        )}
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
