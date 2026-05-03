import { useState, useRef, useEffect } from 'react'
import { MarkdownLite } from './MarkdownLite'
import type { Note } from '../../types'
import { useDocumentUpload } from '../../hooks/useDocumentUpload'
import { useNoteAttachments } from '../../hooks/useNoteAttachments'
import { TagEditor } from '../TagEditor'
import { isAutoTag } from '../../core/tags'
import { ComposerToolbar } from './ComposerToolbar'
import Styles from './NoteItem.module.css'

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
    setTitle(note.title || '')
    setContent(note.content || '')
    setTags(note.tags)
  }, [note.title, note.content, note.tags])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 100)}px`
    }
  }, [isEditing, content])

  const handleSave = async () => {
    if (saving) return
    const newTitle = title.trim()
    const newContent = content.trim()
    if (!newContent && !newTitle) {
      setTitle(note.title)
      setContent(note.content || '')
      setTags(note.tags)
      setIsEditing(false)
      return
    }
    setSaving(true)
    await onUpdate(note.id, newTitle, newContent, tags.filter(t => !isAutoTag(t)))
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

  if (isEditing) {
    return (
      <div className={Styles.noteCardEditing}>
        <input
          className={Styles.composerTitleBorderless}
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
          className={Styles.composerBodyBorderless}
          placeholder="What do you want to remember?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className={Styles.composerFooterBorderlessFooter}>
          <div className={Styles.composerActions}>
            <ComposerToolbar
              onInsertMarkdown={(md) => setContent((prev) => prev + md)}
              onImageUpload={handleImageUpload}
              onVideoUpload={() => void handleVideoUpload()}
              onDocumentUpload={handleDocumentUpload}
              disabled={saving || uploading}
            />
            <button
              className={Styles.composerCancel}
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
              className={Styles.composerSave}
              onClick={handleSave}
              disabled={saving || uploading || (!content.trim() && !title.trim())}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <span className={Styles.composerHint}>⌘ enter to save</span>
        </div>
      </div>
    )
  }

  return (
    <div className={Styles.noteCard} onClick={() => { if (!isEditing && onExpand) onExpand() }}>
      <div className={Styles.noteCardHeader}>
        <span className={Styles.noteCardTitle}>{note.title || 'Untitled'}</span>
        <div className={Styles.noteCardActions} onClick={(e) => e.stopPropagation()}>
          <button
            className={Styles.noteCardAction}
            onClick={() => setIsEditing(true)}
            aria-label="Edit note"
            title="Edit"
          >
            &#9998;
          </button>
          <button
            className={Styles.noteCardDelete}
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
        <div className={Styles.noteCardBody}>
          <MarkdownLite content={note.content} noteId={note.id} />
        </div>
      )}
      <time className={Styles.noteCardTime}>
        {new Date(note.updatedAt).toLocaleString()}
      </time>
    </div>
  )
}
