import { useState, useRef, useEffect } from 'react'
import { MarkdownLite } from './editor/MarkdownLite'
import type { Note } from '../types'
import { TagEditor } from './TagEditor'
import { isAutoTag } from '../core/tags'
import { useComposer } from '../hooks/useComposer'
import { useSidebarPrefs } from '../hooks/useSidebarPrefs'
import { ComposerToolbar } from './editor/ComposerToolbar'
import { FormatToolbar } from './editor/FormatToolbar'
import { LiveEditor, type LiveEditorHandle } from './editor/LiveEditor'
import NoteModalStyles from './NoteModal.module.css'
import { FavouriteBtn } from './editor/FavouriteBtn'
import { exportNotes } from '../core/export'
import { setNoteProgress } from '../core/notes'
import { useNotesContext } from '../context/NotesContext'
import { ComposerSuggestions } from './ai/ComposerSuggestions'
import { toast } from '../lib/toast'

interface Props {
  note: Note
  isOpen: boolean
  onClose: () => void
  onUpdate?: (id: string, title: string, content: string, tags?: string[]) => Promise<Note | undefined>
  onUpdateTags?: (id: string, userTags: string[]) => Promise<void>
}

export function NoteModal({ note, isOpen, onClose, onUpdate, onUpdateTags }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content || '')
  const [tags, setTags] = useState<string[]>(note.tags)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<LiveEditorHandle>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const maxProgressRef = useRef(0)
  // Guards the click-to-close: only close when the press *started* on the
  // backdrop. A text-selection drag that begins in the editor and releases
  // over the backdrop fires a `click` on the overlay (the common ancestor of
  // the down/up targets) — without this it would wrongly close mid-selection.
  const overlayPressRef = useRef(false)
  const { notes } = useNotesContext()
  const { collapsed: sidebarCollapsed } = useSidebarPrefs()
  const currentUserTags = note.tags.filter((t) => !isAutoTag(t))

  const { uploading, isRecording, toolbarProps } = useComposer({
    noteId: note.id,
    appendMarkdown: (md) => setContent((prev) => prev + md),
    focusTextarea: () => editorRef.current?.focus(),
  })
  // A second instance just for the editor's right-click "Import" submenu —
  // same upload plumbing, but inserts land at the click position instead of
  // always appending to the end.
  const { toolbarProps: contextMenuImportProps } = useComposer({
    noteId: note.id,
    appendMarkdown: (md) => editorRef.current?.insertAtCursor(md),
    focusTextarea: () => editorRef.current?.focus(),
  })

  useEffect(() => {
    setTitle(note.title)
    setContent(note.content || '')
    setTags(note.tags)
    setIsEditing(false)
    setExpanded(false)
  }, [note])

  // Track reading progress (max scroll fraction reached) and persist it on close
  // / note change — drives the dashboard's "Continue learning".
  useEffect(() => {
    maxProgressRef.current = 0
    const noteId = note.id
    // A short note that fits without scrolling counts as fully read.
    const probe = window.setTimeout(() => {
      const el = bodyRef.current
      if (el && el.scrollHeight - el.clientHeight <= 4) maxProgressRef.current = 1
    }, 250)
    return () => {
      window.clearTimeout(probe)
      if (maxProgressRef.current > 0) void setNoteProgress(noteId, maxProgressRef.current)
    }
  }, [note.id])

  const handleBodyScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const scrollable = el.scrollHeight - el.clientHeight
    const frac = scrollable > 4 ? el.scrollTop / scrollable : 1
    if (frac > maxProgressRef.current) maxProgressRef.current = Math.min(1, frac)
  }

  const handleSave = async () => {
    if (!onUpdate || saving) return
    setSaving(true)
    try {
      await onUpdate(note.id, title.trim(), content.trim(), tags.filter(t => !isAutoTag(t)))
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to save note:', err)
      toast.error('Failed to save note.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setTitle(note.title)
    setContent(note.content || '')
    setTags(note.tags)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
    if (e.key === 'Escape') handleCancel()
  }

  if (!isOpen) return null

  return (
    <div
      className={NoteModalStyles.noteModalOverlay}
      onMouseDown={(e) => { overlayPressRef.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (e.target === e.currentTarget && overlayPressRef.current) onClose()
        overlayPressRef.current = false
      }}
    >
      <div
        className={`${NoteModalStyles.noteModalContainer}${expanded ? ' ' + NoteModalStyles.expanded : ''}`}
        style={expanded ? { left: `var(${sidebarCollapsed ? '--sidebar-collapsed-width' : '--sidebar-width'})` } : undefined}
      >
        <FavouriteBtn noteId={note.id} />
        <button
          className={NoteModalStyles.noteModalExpand}
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? 'Restore' : 'Expand to full screen'}
          title={expanded ? 'Restore' : 'Expand to full screen'}
        >
          {expanded ? '⤡' : '⤢'}
        </button>
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
            <ComposerSuggestions
              note={{ ...note, title, content, tags }}
              allNotes={notes}
              currentTags={tags.filter((t) => !isAutoTag(t))}
              onAddTag={(tag) => setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]))}
              onAddLink={(linkTitle) => {
                const wl = `[[${linkTitle}]]`
                setContent((prev) => (prev.includes(wl) ? prev : `${prev.trimEnd()}\n\n${wl}\n`))
              }}
            />
            <LiveEditor
              ref={editorRef}
              className={NoteModalStyles.noteModalTextareaEditor}
              placeholder="Note content..."
              value={content}
              onChange={setContent}
              onSubmit={() => void handleSave()}
              onCancel={handleCancel}
              notes={notes}
              noteId={note.id}
              allowNavigate
              importHandlers={contextMenuImportProps}
            />
            <div className={NoteModalStyles.noteModalActions}>
              <div className={NoteModalStyles.noteModalToolbar}>
                <ComposerToolbar {...toolbarProps} disabled={saving || uploading} />
                <FormatToolbar editorRef={editorRef} disabled={saving || uploading} />
              </div>
              <div className={NoteModalStyles.noteModalSaveRow}>
                <button
                  className={`${NoteModalStyles.noteModalBtn} ${NoteModalStyles.noteModalBtnCancel}`}
                  onClick={handleCancel}
                  disabled={saving || uploading}
                >
                  Cancel
                </button>
                <span
                  style={{ display: 'inline-flex' }}
                  title={isRecording ? 'Finish recording before save' : undefined}
                >
                  <button
                    className={`${NoteModalStyles.noteModalBtn} ${NoteModalStyles.noteModalBtnSave}`}
                    onClick={handleSave}
                    disabled={saving || uploading || isRecording}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className={NoteModalStyles.noteModalViewMode}>
            <div className={NoteModalStyles.noteModalHeader}>
              <h2 className={NoteModalStyles.noteModalTitle}>{title || 'Untitled'}</h2>
              <button
                className={NoteModalStyles.noteModalEditBtn}
                onClick={async () => {
                  try {
                    const n = await exportNotes([note])
                    if (n) toast.success('Exported note as Markdown.')
                  } catch (err) {
                    toast.error('Export failed: ' + String(err))
                  }
                }}
                aria-label="Export note as Markdown"
                title="Export as Markdown"
              >
                ⤓
              </button>
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
            <ComposerSuggestions
              note={note}
              allNotes={notes}
              currentTags={currentUserTags}
              onAddTag={onUpdateTags ? (tag) => onUpdateTags(note.id, [...currentUserTags, tag]) : undefined}
              onAddLink={
                onUpdate
                  ? (linkTitle) => {
                      const wl = `[[${linkTitle}]]`
                      if (note.content.includes(wl)) return
                      onUpdate(note.id, note.title, `${note.content.trimEnd()}\n\n${wl}\n`)
                    }
                  : undefined
              }
            />
            <div className={NoteModalStyles.noteModalBody} ref={bodyRef} onScroll={handleBodyScroll}>
              <MarkdownLite content={content} lazy={false} noteId={note.id} fullscreen />
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
