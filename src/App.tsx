import './App.css'
import { NoteCreator } from './ui/editor/NoteCreator'
import { NoteItem } from './ui/editor/NoteItem'
import { useNotes } from './hooks/useNotes'

function App() {
  const { notes, loading, create, update, remove } = useNotes()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Jnana</h1>
          <span>Second brain</span>
        </div>
      </aside>

      <div className="main-content">
        <div className="composer-wrapper">
          <NoteCreator onCreate={create} />
        </div>

        <div className="notes-wrapper">
          {notes.length > 0 && (
            <p className="section-label">
              {notes.length} note{notes.length !== 1 ? 's' : ''}
            </p>
          )}
          {loading && <p className="note-empty">Loading…</p>}
          {!loading && notes.length === 0 && (
            <p className="note-empty">No notes yet.</p>
          )}
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onUpdate={update}
              onRemove={remove}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default App