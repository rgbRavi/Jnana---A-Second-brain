import { useState, useRef, useEffect } from 'react'
import type { Note } from '../../types'

interface Props {
  note: Note
  onUpdate: (id: string, title: string, content: string) => Promise<Note | undefined>
  onRemove: (id: string) => void
}

export function NoteItem({ note, onUpdate, onRemove }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content || '')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync state if note changes from outside
  useEffect(() => {
    setTitle(note.title || '')
    setContent(note.content || '')
  }, [note.title, note.content])

  // Auto-resize textarea logic
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
      // Get the computed height based on scrollHeight
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 100)}px`
    }
  }, [isEditing, content])

  const handleSave = async () => {
    if (saving) return
    const newTitle = title.trim()
    const newContent = content.trim()

    // If both empty, maybe just delete or revert? we'll revert to prevent accidental delete.
    if (!newContent && !newTitle) {
      setTitle(note.title)
      setContent(note.content || '')
      setIsEditing(false)
      return
    }

    setSaving(true)
    await onUpdate(note.id, newTitle, newContent)
    setSaving(false)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setTitle(note.title)
      setContent(note.content || '')
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <div className="note-card editing">
        <input
          className="composer-title borderless"
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <textarea
          ref={textareaRef}
          className="composer-body borderless"
          placeholder="What do you want to remember?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="composer-footer borderless-footer">
          <div className="composer-actions">
            <button
              className="composer-cancel"
              onClick={() => {
                setTitle(note.title)
                setContent(note.content || '')
                setIsEditing(false)
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="composer-save"
              onClick={handleSave}
              disabled={saving || (!content.trim() && !title.trim())}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <span className="composer-hint">⌘ enter to save</span>
        </div>
      </div>
    )
  }

  return (
    <div className="note-card" onClick={() => setIsEditing(true)}>
      <div className="note-card-header">
        <span className="note-card-title">{note.title || 'Untitled'}</span>
        <div className="note-card-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="note-card-action"
            onClick={() => setIsEditing(true)}
            aria-label="Edit note"
            title="Edit"
          >
            &#9998;
          </button>
          <button
            className="note-card-delete"
            onClick={() => onRemove(note.id)}
            aria-label="Delete note"
            title="Delete"
          >
            &times;
          </button>
        </div>
      </div>
      {note.content && (
        <p className="note-card-body">{note.content}</p>
      )}
      <time className="note-card-time">
        {new Date(note.updatedAt).toLocaleString()}
      </time>
    </div>
  )
}
