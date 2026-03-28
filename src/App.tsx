import './App.css'
import { NoteCreator } from './ui/editor/NoteCreator'

function App() {
  return (
    <div className="app-shell">
      {/* Sidebar — your friend will build this out properly */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Jnana</h1>
          <span>Second brain</span>
        </div>
      </aside>

      {/* Main content */}
      <div className="main-content">
        <NoteCreator />
      </div>
    </div>
  )
}

export default App