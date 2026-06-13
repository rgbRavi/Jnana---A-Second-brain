import { useState, useRef, useEffect } from 'react'
import type { Note } from '../../types'
import { useDocumentUpload } from '../../hooks/useDocumentUpload'
import { useNoteAttachments } from '../../hooks/useNoteAttachments'
import { usePendingMedia } from '../../hooks/usePendingMedia'
import { useFavourites } from '../../hooks/useFavourites'
import { useNotesContext } from '../../context/NotesContext'
import { isAutoTag } from '../../core/tags'
import { TagEditor } from '../TagEditor'
import { TagSuggestions } from '../ai/TagSuggestions'
import { LinkSuggestions } from '../ai/LinkSuggestions'
import { ComposerToolbar } from './ComposerToolbar'
import Styles from './NoteCreator.module.css'
import FavStyles from './FavouriteBtn.module.css'

interface Props {
  onCreate: (title: string, content: string, id?: string, tags?: string[]) => Promise<Note>
  onUpdate: (id: string, title: string, content: string, tags?: string[]) => Promise<Note | undefined>
}

export function NoteCreator({ onCreate, onUpdate }: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [saveFavourite, setSaveFavourite] = useState(false)
  // Bumped on save to remount the AI suggestion panels, clearing their results
  // when the composer is reset for a new note.
  const [draftKey, setDraftKey] = useState(0)
  const { addToFavourites } = useFavourites()

  const pendingNoteId = useRef(crypto.randomUUID())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { addPendingMedia, flushPendingMedia, resetPendingMedia } = usePendingMedia()
  const { notes } = useNotesContext()

  // Tag vocabulary across all notes (no auto-tags), for AI suggestions on the draft.
  const tagVocabulary = [...new Set(notes.flatMap((n) => n.tags).filter((t) => !isAutoTag(t)))]
  const draftNote: Note = {
    id: pendingNoteId.current,
    title,
    content,
    tags,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  const { handleDocumentUpload } = useDocumentUpload({
    noteId: pendingNoteId.current,
    onUploadStart: () => setUploading(true),
    onUploadFinish: () => { setUploading(false); textareaRef.current?.focus() },
    onInsertMarkdown: (md) => setContent((prev) => prev + md),
    onRegisterPendingMedia: addPendingMedia,
  })

  const { handleImageUpload, handleVideoUpload, handleAudioUpload, handleAudioBlob } = useNoteAttachments({
    noteId: pendingNoteId.current,
    onUploadStart: () => setUploading(true),
    onUploadFinish: () => setUploading(false),
    onInsertMarkdown: (md) => setContent((prev) => prev + md),
    onFocus: () => textareaRef.current?.focus(),
    onRegisterPendingMedia: addPendingMedia,
  })

  const handleSave = async () => {
    if (!content.trim() && !title.trim()) return
    setSaving(true)
    const saved = await onCreate(title, content, pendingNoteId.current, tags)
    await flushPendingMedia(saved.id)
    await onUpdate(saved.id, saved.title, saved.content, tags)
    if (saveFavourite) await addToFavourites(saved.id)
    setTitle('')
    setContent('')
    setTags([])
    setSaveFavourite(false)
    pendingNoteId.current = crypto.randomUUID()
    resetPendingMedia()
    setDraftKey((k) => k + 1)
    setSaving(false)
    textareaRef.current?.focus()
  }

  useEffect(() => {
    if (!isFullscreen && textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
      const capped = Math.min(textareaRef.current.scrollHeight, 320)
      textareaRef.current.style.height = `${Math.max(capped, 120)}px`
    }
  }, [content, isFullscreen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
    if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false)
  }

  return (
    <div className={`${Styles.composer} ${isFullscreen ? Styles.composerFullscreen : ''}`}>
      <button
        className={FavStyles.favouriteBtn}
        onClick={() => setSaveFavourite(v => !v)}
        title={saveFavourite ? 'Remove from favourites on save' : 'Add to favourites on save'}
        type="button"
      >
        {saveFavourite ? '★' : '☆'}
      </button>
      <button
        className={Styles.expandBtn}
        onClick={() => setIsFullscreen((v) => !v)}
        title={isFullscreen ? 'Minimize' : 'Expand'}
      >
        {isFullscreen ? '🗕' : '🗖'}
      </button>
      <input
        className={Styles.composerTitle}
        type="text"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className={Styles.composerTagSection}>
        <TagEditor tags={tags} onChange={setTags} />
        <TagSuggestions
          key={`tags-${draftKey}`}
          note={draftNote}
          vocabulary={tagVocabulary}
          currentTags={tags}
          onAccept={(tag) => setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]))}
        />
        <LinkSuggestions
          key={`links-${draftKey}`}
          note={draftNote}
          allNotes={notes}
          onAddLink={(linkTitle) => {
            const wl = `[[${linkTitle}]]`
            setContent((prev) => (prev.includes(wl) ? prev : `${prev.trimEnd()}\n\n${wl}\n`))
          }}
        />
      </div>
      <textarea
        ref={textareaRef}
        className={Styles.composerBody}
        placeholder="What do you want to remember?"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <div className={Styles.composerFooter}>
        <span className={Styles.composerHint}>⌘ enter to save</span>
        <div className={Styles.composerActionsRight}>
          <ComposerToolbar
            onInsertMarkdown={(md) => setContent((prev) => prev + md)}
            onImageUpload={handleImageUpload}
            onVideoUpload={() => void handleVideoUpload()}
            onAudioUpload={() => void handleAudioUpload()}
            onRecordAudio={(blob) => void handleAudioBlob(blob)}
            onRecordingChange={setIsRecording}
            onDocumentUpload={handleDocumentUpload}
            disabled={saving || uploading}
          />
          <span
            style={{ display: 'inline-flex' }}
            title={isRecording ? 'Finish recording before save' : undefined}
          >
            <button
              className={Styles.composerSave}
              onClick={handleSave}
              disabled={saving || isRecording || (!content.trim() && !title.trim())}
            >
              {saving ? 'Saving…' : "That's my note →"}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
