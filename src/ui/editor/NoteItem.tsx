import { useState, useRef, useEffect } from 'react'
import { MarkdownLite } from './MarkdownLite'
import type { Note } from '../../types'
import { useComposer } from '../../hooks/useComposer'
import { useNotesContext } from '../../context/NotesContext'
import { TagEditor } from '../TagEditor'
import { ComposerSuggestions } from '../ai/ComposerSuggestions'
import { isAutoTag } from '../../core/tags'
import { ComposerToolbar } from './ComposerToolbar'
import Styles from './NoteItem.module.css'

/** Display density — mirrors DisplayMode in views/notes/filterNotes.ts (kept local
 *  so this ui/ component doesn't import upward from views/). */
export type NoteVariant = 'card' | 'compact' | 'grid' | 'comfortable'

interface Props {
  note: Note
  onUpdate: (id: string, title: string, content: string, tags?: string[]) => Promise<Note | undefined>
  onRemove: (id: string) => void
  onExpand?: () => void
  variant?: NoteVariant
  isFavourite?: boolean
  onToggleFavourite?: () => void
  /** Per-workspace pin (separate from the global favourite). */
  pinned?: boolean
  onTogglePin?: () => void
  /** Tooltip/label for the remove (trash) button — e.g. "Remove from workspace". */
  removeTitle?: string
  /** Show a "file into workspace" action (All-Notes view). */
  onAddToWorkspace?: () => void
}

/** Auto-tag → chip glyph + label, shown on non-default variants. */
const MEDIA_CHIPS: [string, string, string][] = [
  ['has:image', '🖼', 'Images'],
  ['has:videoOrYt', '🎬', 'Video'],
  ['has:audio', '🎧', 'Audio'],
  ['has:pdf', '📄', 'PDF'],
  ['has:docxlink', '📎', 'Document'],
  ['has:webpage', '🌐', 'Web page'],
]

export function NoteItem({
  note,
  onUpdate,
  onRemove,
  onExpand,
  variant = 'card',
  isFavourite,
  onToggleFavourite,
  pinned,
  onTogglePin,
  removeTitle = 'Delete note',
  onAddToWorkspace,
}: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content || '')
  const [tags, setTags] = useState<string[]>(note.tags)
  const [saving, setSaving] = useState(false)
  const { notes } = useNotesContext()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { uploading, isRecording, toolbarProps } = useComposer({
    noteId: note.id,
    appendMarkdown: (md) => setContent((prev) => prev + md),
    focusTextarea: () => textareaRef.current?.focus(),
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
            <ComposerToolbar {...toolbarProps} disabled={saving || uploading} />
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
            <span
              style={{ display: 'inline-flex' }}
              title={isRecording ? 'Finish recording before save' : undefined}
            >
              <button
                className={Styles.composerSave}
                onClick={handleSave}
                disabled={saving || uploading || isRecording || (!content.trim() && !title.trim())}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </span>
          </div>
          <span className={Styles.composerHint}>⌘ enter to save</span>
        </div>
      </div>
    )
  }

  const userTags = note.tags.filter((t) => !isAutoTag(t))
  const mediaChips = MEDIA_CHIPS.filter(([tag]) => note.tags.includes(tag))
  const showBody = variant !== 'compact' && !!note.content

  return (
    <div
      className={`${Styles.noteCard} ${Styles[variant]}`}
      onClick={() => { if (!isEditing && onExpand) onExpand() }}
    >
      <div className={Styles.noteCardHeader}>
        <span className={Styles.noteCardTitle}>{note.title || 'Untitled'}</span>
        <div className={Styles.noteCardActions} onClick={(e) => e.stopPropagation()}>
          {onTogglePin && (
            <button
              className={`${Styles.noteCardAction} ${pinned ? Styles.noteCardFavOn : ''}`}
              onClick={onTogglePin}
              aria-label={pinned ? 'Unpin from workspace' : 'Pin in workspace'}
              aria-pressed={pinned}
              title={pinned ? 'Unpin' : 'Pin in workspace'}
            >
              {pinned ? '📌' : '📍'}
            </button>
          )}
          {onToggleFavourite && (
            <button
              className={`${Styles.noteCardAction} ${isFavourite ? Styles.noteCardFavOn : ''}`}
              onClick={onToggleFavourite}
              aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
              aria-pressed={isFavourite}
              title={isFavourite ? 'Unfavourite' : 'Favourite'}
            >
              {isFavourite ? '★' : '☆'}
            </button>
          )}
          {onAddToWorkspace && (
            <button
              className={Styles.noteCardAction}
              onClick={onAddToWorkspace}
              aria-label="Add to workspace"
              title="Add to workspace"
            >
              📁
            </button>
          )}
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
            aria-label={removeTitle}
            title={removeTitle}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M1 3.5h12M4.5 3.5V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M5.5 6.5v4M8.5 6.5v4M2.5 3.5l.75 7.25a.5.5 0 0 0 .5.45h6.5a.5.5 0 0 0 .5-.45L11.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      {showBody && (
        <div className={Styles.noteCardBody}>
          <MarkdownLite content={note.content} noteId={note.id} />
        </div>
      )}
      <div className={Styles.noteCardMeta}>
        {mediaChips.map(([tag, glyph, label]) => (
          <span key={tag} className={Styles.noteChip} title={label} aria-label={label}>
            {glyph}
          </span>
        ))}
        {userTags.map((t) => (
          <span key={t} className={Styles.noteTag}>
            {t}
          </span>
        ))}
        <time className={Styles.noteCardTime}>{new Date(note.updatedAt).toLocaleDateString()}</time>
      </div>
    </div>
  )
}
