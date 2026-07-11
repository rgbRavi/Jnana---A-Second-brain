// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { memo, useState, useRef, useEffect } from 'react'
import { MarkdownLite } from './MarkdownLite'
import { truncateMarkdown } from '../../core/markdown/preview'
import type { Note } from '../../types'
import { useComposer } from '../../hooks/useComposer'
import { useNotesContext } from '../../context/NotesContext'
import { TagEditor } from '../TagEditor'
import { ComposerSuggestions } from '../ai/ComposerSuggestions'
import { isAutoTag } from '../../core/tags'
import { ComposerToolbar } from './ComposerToolbar'
import { FormatToolbar } from './FormatToolbar'
import { LiveEditor, type LiveEditorHandle } from './LiveEditor'
import Styles from './NoteItem.module.css'

/** Display density — mirrors DisplayMode in views/notes/filterNotes.ts (kept local
 *  so this ui/ component doesn't import upward from views/). */
export type NoteVariant = 'card' | 'compact' | 'grid' | 'comfortable'

interface Props {
  note: Note
  onUpdate: (id: string, title: string, content: string, tags?: string[]) => Promise<Note | undefined>
  onRemove: (id: string) => void
  /** Receives the note itself (not just its id) — callers can pass a stable,
   *  id-agnostic handler instead of a fresh per-note closure. */
  onExpand?: (note: Note) => void
  variant?: NoteVariant
  isFavourite?: boolean
  onToggleFavourite?: (id: string) => void
  /** Per-workspace pin (separate from the global favourite). */
  pinned?: boolean
  onTogglePin?: (id: string) => void
  /** Tooltip/label for the remove (trash) button — e.g. "Remove from workspace". */
  removeTitle?: string
  /** Show a "file into workspace" action (All-Notes view). */
  onAddToWorkspace?: (id: string) => void
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

/**
 * The editing form for a note card. Split out from `NoteItem` deliberately:
 * it's the only part that needs `useNotesContext()` (for `ComposerSuggestions`'
 * `allNotes`), and that context's value object is recreated on every note
 * save (see useNotes.ts) — any component calling it re-renders on every save,
 * bypassing memo. Mounting/unmounting this only while a card is actually being
 * edited keeps that subscription off the common read-mode path, so the
 * (memoized) card list below doesn't pay for it on every unrelated save.
 */
function NoteItemEditForm({
  note,
  onUpdate,
  onDone,
}: {
  note: Note
  onUpdate: Props['onUpdate']
  onDone: () => void
}) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content || '')
  const [tags, setTags] = useState<string[]>(note.tags)
  const [saving, setSaving] = useState(false)
  const { notes } = useNotesContext()
  const editorRef = useRef<LiveEditorHandle>(null)
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
    setTitle(note.title || '')
    setContent(note.content || '')
    setTags(note.tags)
  }, [note.title, note.content, note.tags])

  const handleSave = async () => {
    if (saving) return
    const newTitle = title.trim()
    const newContent = content.trim()
    if (!newContent && !newTitle) {
      onDone()
      return
    }
    setSaving(true)
    await onUpdate(note.id, newTitle, newContent, tags.filter(t => !isAutoTag(t)))
    setSaving(false)
    onDone()
  }

  const handleCancel = () => onDone()

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
    if (e.key === 'Escape') handleCancel()
  }

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
      <LiveEditor
        ref={editorRef}
        className={Styles.composerBodyBorderlessEditor}
        placeholder="What do you want to remember?"
        value={content}
        onChange={setContent}
        onSubmit={() => void handleSave()}
        onCancel={handleCancel}
        notes={notes}
        noteId={note.id}
        allowNavigate={false}
        importHandlers={contextMenuImportProps}
      />
      <div className={Styles.composerFooterBorderlessFooter}>
        <div className={Styles.composerActions}>
          <ComposerToolbar {...toolbarProps} disabled={saving || uploading} />
          <FormatToolbar editorRef={editorRef} disabled={saving || uploading} />
          <button
            className={Styles.composerCancel}
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

function NoteItemImpl({
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

  if (isEditing) {
    return <NoteItemEditForm note={note} onUpdate={onUpdate} onDone={() => setIsEditing(false)} />
  }

  const userTags = note.tags.filter((t) => !isAutoTag(t))
  const mediaChips = MEDIA_CHIPS.filter(([tag]) => note.tags.includes(tag))
  const showBody = variant !== 'compact' && !!note.content
  // A card is a preview, not the full note (that's the modal) — cap the body so
  // long notes don't each parse their entire content through react-markdown.
  // Deterministic, so MarkdownLite's memoized parse still holds across renders.
  const previewBody = truncateMarkdown(note.content)

  return (
    <div
      className={`${Styles.noteCard} ${Styles[variant]}`}
      onClick={() => { if (!isEditing) onExpand?.(note) }}
    >
      <div className={Styles.noteCardHeader}>
        <span className={Styles.noteCardTitle}>{note.title || 'Untitled'}</span>
        <div className={Styles.noteCardActions} onClick={(e) => e.stopPropagation()}>
          {onTogglePin && (
            <button
              className={`${Styles.noteCardAction} ${pinned ? Styles.noteCardFavOn : ''}`}
              onClick={() => onTogglePin(note.id)}
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
              onClick={() => onToggleFavourite(note.id)}
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
              onClick={() => onAddToWorkspace(note.id)}
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
          <MarkdownLite content={previewBody} noteId={note.id} />
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

/** Memoized so a save to one note doesn't re-render every other visible card —
 *  callers must pass stable (id-based) callbacks for this to actually bite;
 *  see Notes.tsx / WorkspaceNotes.tsx. */
export const NoteItem = memo(NoteItemImpl)
