import './App.css'
import { useState } from 'react'
import { NoteCreator } from './ui/editor/NoteCreator'
import { NoteItem } from './ui/editor/NoteItem'
import { useNotes } from './hooks/useNotes'
import { GraphView } from './ui/graph/GraphView'

function App() {
  const { notes, loading, create, update, remove } = useNotes()
  const [currentView, setCurrentView] = useState<'notes' | 'graph'>('notes')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Jnana</h1>
          <span>Second brain</span>
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`sidebar-nav-item ${currentView === 'notes' ? 'active' : ''}`}
            onClick={() => setCurrentView('notes')}
          >
            📋 Notes
          </button>
          <button 
            className={`sidebar-nav-item ${currentView === 'graph' ? 'active' : ''}`}
            onClick={() => setCurrentView('graph')}
          >
            🕸️ Graph View
          </button>
        </nav>
      </aside>

      <div className="main-content">
        {currentView === 'notes' ? (
          <>
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
          </>
        ) : (
          <GraphView />
        )}
      </div>
    </div>
  )
}

export default App