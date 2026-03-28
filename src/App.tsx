import './App.css'
import { NoteCreator } from './ui/editor/NoteCreator'
import { useNotes } from './hooks/useNotes'

function App() {
  const { notes, loading, create, remove } = useNotes()

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
            <div key={note.id} className="note-card">
              <div className="note-card-header">
                <span className="note-card-title">{note.title || 'Untitled'}</span>
                <button
                  className="note-card-delete"
                  onClick={() => remove(note.id)}
                  aria-label="Delete note"
                >×</button>
              </div>
              {note.content && (
                <p className="note-card-body">{note.content}</p>
              )}
              <time className="note-card-time">
                {new Date(note.updatedAt).toLocaleString()}
              </time>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App