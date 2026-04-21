import { useState, useRef, useEffect } from 'react'
import { MarkdownLite } from './MarkdownLite'
import type { Note } from '../../types'

import { useDocumentUpload } from '../../hooks/useDocumentUpload'
import { useNoteAttachments } from '../../hooks/useNoteAttachments'
import { TagEditor } from '../TagEditor'
import { isAutoTag } from '../../core/tags'

interface Props {
  note: Note
  onUpdate: (id: string, title: string, content: string, tags?: string[]) => Promise<Note | undefined>
  onRemove: (id: string) => void
  onExpand?: () => void
}

export function NoteItem({ note, onUpdate, onRemove, onExpand }: Props) {
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

  // Sync state if note changes from outside
  useEffect(() => {
    setTitle(note.title || '')
    setContent(note.content || '')
    setTags(note.tags)
  }, [note.title, note.content, note.tags])

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
      setTags(note.tags)
      setIsEditing(false)
      return
    }

    setSaving(true)
    const userTags = tags.filter(t => !isAutoTag(t))
    await onUpdate(note.id, newTitle, newContent, userTags)
    setSaving(false)
    setIsEditing(false)
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
        <TagEditor 
          tags={tags} 
          onChange={(newUserTags) => setTags([...tags.filter(isAutoTag), ...newUserTags])} 
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
            <button
              className="composer-cancel"
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
              className="composer-save"
              onClick={handleSave}
              disabled={saving || uploading || (!content.trim() && !title.trim())}
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
    <div className="note-card" onClick={() => {
      if (!isEditing && onExpand) onExpand()
    }}>
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
            title="Delete note"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M1 3.5h12M4.5 3.5V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M5.5 6.5v4M8.5 6.5v4M2.5 3.5l.75 7.25a.5.5 0 0 0 .5.45h6.5a.5.5 0 0 0 .5-.45L11.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      {note.content && (
        <div className="note-card-body">
          <MarkdownLite content={note.content} noteId={note.id} />
        </div>
      )}
      <time className="note-card-time">
        {new Date(note.updatedAt).toLocaleString()}
      </time>
    </div>
  )
}
