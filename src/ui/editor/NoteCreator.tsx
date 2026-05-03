import { useState, useRef } from 'react'
import type { Note } from '../../types'
import { useDocumentUpload } from '../../hooks/useDocumentUpload'
import { useNoteAttachments } from '../../hooks/useNoteAttachments'
import { usePendingMedia } from '../../hooks/usePendingMedia'
import { TagEditor } from '../TagEditor'
import { ComposerToolbar } from './ComposerToolbar'
import Styles from './NoteCreator.module.css'

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

  const pendingNoteId = useRef(crypto.randomUUID())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { addPendingMedia, flushPendingMedia, resetPendingMedia } = usePendingMedia()

  const { handleDocumentUpload } = useDocumentUpload({
    noteId: pendingNoteId.current,
    onUploadStart: () => setUploading(true),
    onUploadFinish: () => { setUploading(false); textareaRef.current?.focus() },
    onInsertMarkdown: (md) => setContent((prev) => prev + md),
    onRegisterPendingMedia: addPendingMedia,
  })

  const { handleImageUpload, handleVideoUpload } = useNoteAttachments({
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
    setTitle('')
    setContent('')
    setTags([])
    pendingNoteId.current = crypto.randomUUID()
    resetPendingMedia()
    setSaving(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
  }

  return (
    <div className={Styles.composer}>
      <input
        className={Styles.composerTitle}
        type="text"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <TagEditor tags={tags} onChange={setTags} />
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
            onDocumentUpload={handleDocumentUpload}
            disabled={saving || uploading}
          />
          <button
            className={Styles.composerSave}
            onClick={handleSave}
            disabled={saving || (!content.trim() && !title.trim())}
          >
            {saving ? 'Saving…' : "That's my note →"}
          </button>
        </div>
      </div>
    </div>
  )
}
