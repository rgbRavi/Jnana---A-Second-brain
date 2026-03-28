import { useState } from 'react'
import { saveNote, getAllNotes, createNote } from './core/notes'
import type { Note } from './types'

function App() {
  const [notes, setNotes] = useState<Note[]>([])

  async function handleCreate() {
    const note = createNote('Test Note')
    await saveNote(note)
    const all = await getAllNotes()
    setNotes(all)
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Jnana</h1>
      <button onClick={handleCreate}>Create test note</button>
      <ul>
        {notes.map(n => (
          <li key={n.id}>{n.title} — {new Date(n.createdAt).toLocaleTimeString()}</li>
        ))}
      </ul>
    </div>
  )
}

export default App