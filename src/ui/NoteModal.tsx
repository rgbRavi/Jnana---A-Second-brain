import { useState, useRef, useEffect } from 'react'
import { MarkdownLite } from './editor/MarkdownLite'
import type { Note } from '../types'
import { TagEditor } from './TagEditor'
import { isAutoTag } from '../core/tags'
import { useDocumentUpload } from '../hooks/useDocumentUpload'
import { useNoteAttachments } from '../hooks/useNoteAttachments'
import { ComposerToolbar } from './editor/ComposerToolbar'
import NoteModalStyles from './NoteModal.module.css'
import { FavouriteBtn } from './editor/FavouriteBtn'

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

  const { handleDocumentUpload } = useDocumentUpload({
    noteId: note.id,
    onUploadStart: () => setUploading(true),
    onUploadFinish: () => { setUploading(false); textareaRef.current?.focus() },
    onInsertMarkdown: (md) => setContent((prev) => prev + md),
  })

  const { handleImageUpload, handleVideoUpload } = useNoteAttachments({
    noteId: note.id,
    onUploadStart: () => setUploading(true),
    onUploadFinish: () => setUploading(false),
    onInsertMarkdown: (md) => setContent((prev) => prev + md),
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
      const capped = Math.min(textareaRef.current.scrollHeight, 320)
      textareaRef.current.style.height = `${Math.max(capped, 120)}px`
    }
  }, [isEditing, content])

  const handleSave = async () => {
    if (!onUpdate || saving) return
    setSaving(true)
    try {
      await onUpdate(note.id, title.trim(), content.trim(), tags.filter(t => !isAutoTag(t)))
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

  if (!isOpen) return null

  return (
    <div className={NoteModalStyles.noteModalOverlay} onClick={onClose}>
      <div className={NoteModalStyles.noteModalContainer} onClick={(e) => e.stopPropagation()}>
        <FavouriteBtn noteId={note.id} />
        <button className={NoteModalStyles.noteModalClose} onClick={onClose} aria-label="Close">
          ✕
        </button>

        {isEditing ? (
          <div className={NoteModalStyles.noteModalEditMode}>
            <input
              type="text"
              className={NoteModalStyles.noteModalTitleInput}
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
              className={NoteModalStyles.noteModalTextarea}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Note content..."
              onKeyDown={handleKeyDown}
            />
            <div className={NoteModalStyles.noteModalActions}>
              <div className={NoteModalStyles.noteModalToolbar}>
                <ComposerToolbar
                  onInsertMarkdown={(md) => setContent((prev) => prev + md)}
                  onImageUpload={handleImageUpload}
                  onVideoUpload={() => void handleVideoUpload()}
                  onDocumentUpload={handleDocumentUpload}
                  disabled={saving || uploading}
                />
              </div>
              <div className={NoteModalStyles.noteModalSaveRow}>
                <button
                  className={`${NoteModalStyles.noteModalBtn} ${NoteModalStyles.noteModalBtnCancel}`}
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
                  className={`${NoteModalStyles.noteModalBtn} ${NoteModalStyles.noteModalBtnSave}`}
                  onClick={handleSave}
                  disabled={saving || uploading}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={NoteModalStyles.noteModalViewMode}>
            <div className={NoteModalStyles.noteModalHeader}>
              <h2 className={NoteModalStyles.noteModalTitle}>{title || 'Untitled'}</h2>
              {onUpdate && (
                <button
                  className={NoteModalStyles.noteModalEditBtn}
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
            <div className={NoteModalStyles.noteModalBody}>
              <MarkdownLite content={content} lazy={false} noteId={note.id} />
            </div>
            <time className={NoteModalStyles.noteModalTime}>
              {new Date(note.updatedAt).toLocaleString()}
            </time>
          </div>
        )}
      </div>
    </div>
  )
}
