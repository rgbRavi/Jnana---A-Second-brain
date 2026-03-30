import { useState, useRef, useEffect } from 'react'
import { MarkdownLite } from './editor/MarkdownLite'
import type { Note } from '../types'

interface Props {
  note: Note
  isOpen: boolean
  onClose: () => void
  onUpdate?: (id: string, title: string, content: string) => Promise<Note | undefined>
}

export function NoteModal({ note, isOpen, onClose, onUpdate }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content || '')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTitle(note.title)
    setContent(note.content || '')
    setIsEditing(false)
  }, [note])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 100)}px`
    }
  }, [isEditing, content])

  const handleSave = async () => {
    if (!onUpdate) return
    if (saving) return

    setSaving(true)
    try {
      await onUpdate(note.id, title.trim(), content.trim())
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to save note:', err)
      alert('Failed to save note')
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setTitle(note.title)
      setContent(note.content || '')
      setIsEditing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="note-modal-overlay" onClick={onClose}>
      <div className="note-modal-container" onClick={(e) => e.stopPropagation()}>
        <button 
          className="note-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        
        {isEditing ? (
          <div className="note-modal-edit-mode">
            <input
              type="text"
              className="note-modal-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              onKeyDown={handleKeyDown}
            />
            <textarea
              ref={textareaRef}
              className="note-modal-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Note content..."
              onKeyDown={handleKeyDown}
            />
            <div className="note-modal-actions">
              <button 
                className="note-modal-btn note-modal-btn-cancel"
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
                className="note-modal-btn note-modal-btn-save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="note-modal-view-mode">
            <div className="note-modal-header">
              <h2 className="note-modal-title">{title || 'Untitled'}</h2>
              {onUpdate && (
                <button
                  className="note-modal-edit-btn"
                  onClick={() => setIsEditing(true)}
                  aria-label="Edit note"
                  title="Edit"
                >
                  ✎
                </button>
              )}
            </div>
            
            <div className="note-modal-body">
              <MarkdownLite content={content} lazy={false} />
            </div>
            
            <time className="note-modal-time">
              {new Date(note.updatedAt).toLocaleString()}
            </time>
          </div>
        )}
      </div>
    </div>
  )
}
