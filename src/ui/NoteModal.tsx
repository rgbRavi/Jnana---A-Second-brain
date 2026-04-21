import { useState, useRef, useEffect } from 'react'
import { MarkdownLite } from './editor/MarkdownLite'
import type { Note } from '../types'
import { TagEditor } from './TagEditor'
import { isAutoTag } from '../core/tags'

import { useDocumentUpload } from '../hooks/useDocumentUpload'
import { useNoteAttachments } from '../hooks/useNoteAttachments'

interface Props {
  note: Note
  isOpen: boolean
  onClose: () => void
  onUpdate?: (id: string, title: string, content: string, tags?: string[]) => Promise<Note | undefined>
  onUpdateTags?: (id: string, userTags: string[]) => Promise<void>
}

export function NoteModal({ note, isOpen, onClose, onUpdate, onUpdateTags }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content || '')
  const [tags, setTags] = useState<string[]>(note.tags)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { handleDocumentUpload } = useDocumentUpload({
    noteId: note.id,
    onUploadStart: () => setUploading(true),
    onUploadFinish: () => {
      setUploading(false)
      textareaRef.current?.focus()
    },
    onInsertMarkdown: (markdown) => setContent((prev) => prev + markdown),
  })

  const { handleImageUpload, handleVideoUpload } = useNoteAttachments({
    noteId: note.id,
    onUploadStart: () => setUploading(true),
    onUploadFinish: () => setUploading(false),
    onInsertMarkdown: (markdown) => setContent((prev) => prev + markdown),
    onFocus: () => textareaRef.current?.focus(),
  })

  useEffect(() => {
    setTitle(note.title)
    setContent(note.content || '')
    setTags(note.tags)
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
      const userTags = tags.filter(t => !isAutoTag(t))
      await onUpdate(note.id, title.trim(), content.trim(), userTags)
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
      setTags(note.tags)
      setIsEditing(false)
    }
  }

  const handleYouTubeEmbed = () => {
    const url = window.prompt('Paste a YouTube URL:')
    if (!url) return

    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
    const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)
    const videoId = shortMatch?.[1] || watchMatch?.[1]

    if (!videoId) {
      alert('Could not extract a YouTube video ID from that URL.')
      return
    }

    const ytMarkdown = `\n![youtube](https://youtube.com/watch?v=${videoId})\n`
    setContent((prev) => prev + ytMarkdown)
    textareaRef.current?.focus()
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
            <TagEditor 
              tags={tags} 
              onChange={(newUserTags) => setTags([...tags.filter(isAutoTag), ...newUserTags])} 
            />
            <textarea
              ref={textareaRef}
              className="note-modal-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Note content..."
              onKeyDown={handleKeyDown}
            />
            <div className="note-modal-actions" style={{ justifyContent: 'space-between' }}>
              <div className="composer-actions">
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  ref={fileInputRef}
                  onChange={(e) =>
                    void handleImageUpload(e.target.files?.[0], () => {
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    })
                  }
                />
                <button
                  className="composer-icon-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving || uploading}
                  title="Attach Image"
                >
                  {uploading ? '⏳' : '📷'}
                </button>
                <button
                  className="composer-icon-btn"
                  onClick={() => void handleVideoUpload()}
                  disabled={saving || uploading}
                  title="Attach Video"
                >
                  {uploading ? '⏳' : '🎬'}
                </button>
                <button
                  className="composer-icon-btn"
                  onClick={handleDocumentUpload}
                  disabled={saving || uploading}
                  title="Attach Document"
                >
                  {uploading ? '⏳' : '📄'}
                </button>
                <button
                  className="composer-icon-btn"
                  onClick={handleYouTubeEmbed}
                  disabled={saving || uploading}
                  title="Embed YouTube"
                >
                  ▶️
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button 
                  className="note-modal-btn note-modal-btn-cancel"
                  onClick={() => {
                    setTitle(note.title)
                    setContent(note.content || '')
                    setTags(note.tags)
                    setIsEditing(false)
                  }}
                  disabled={saving || uploading}
                >
                  Cancel
                </button>
                <button
                  className="note-modal-btn note-modal-btn-save"
                  onClick={handleSave}
                  disabled={saving || uploading}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
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

            <TagEditor
              tags={note.tags}
              onChange={(userTags) => onUpdateTags?.(note.id, userTags)}
            />

            <div className="note-modal-body">
              <MarkdownLite content={content} lazy={false} noteId={note.id} />
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
