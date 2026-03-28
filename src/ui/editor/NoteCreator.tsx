import { useState, useRef } from 'react'
import { useNotes } from '../../hooks/useNotes'

export function NoteCreator() {
  const { notes, loading, create, remove } = useNotes()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSave = async () => {
    if (!content.trim() && !title.trim()) return
    setSaving(true)
    await create(title, content)
    setTitle('')
    setContent('')
    setSaving(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSave()
    }
  }

  return (
    <>
      {/* Composer */}
      <div className="composer">
        <input
          className="composer-title"
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <textarea
          ref={textareaRef}
          className="composer-body"
          placeholder="What do you want to remember?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="composer-footer">
          <span className="composer-hint">⌘ enter to save</span>
          <button
            className="composer-save"
            onClick={handleSave}
            disabled={saving || (!content.trim() && !title.trim())}
          >
            {saving ? 'Saving…' : "That's my note →"}
          </button>
        </div>
      </div>

      {/* Notes list */}
      {notes.length > 0 && (
        <p className="section-label">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
      )}

      <div className="note-list">
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
                onClick={(e) => { e.stopPropagation(); remove(note.id) }}
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
    </>
  )
}