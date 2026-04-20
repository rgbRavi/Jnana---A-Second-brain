// src/ui/editor/NoteCreator.tsx
import { useState, useRef } from 'react'
import type { Note } from '../../types'
import { useDocumentUpload } from '../../hooks/useDocumentUpload'
import { useNoteAttachments } from '../../hooks/useNoteAttachments'
import { usePendingMedia } from '../../hooks/usePendingMedia'

interface Props {
  onCreate: (title: string, content: string, id?: string) => Promise<Note>
}

export function NoteCreator({ onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const pendingNoteId = useRef(crypto.randomUUID())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addPendingMedia, flushPendingMedia, resetPendingMedia } = usePendingMedia()

  const { handleDocumentUpload } = useDocumentUpload({
    noteId: pendingNoteId.current,
    onUploadStart: () => setUploading(true),
    onUploadFinish: () => {
      setUploading(false)
      textareaRef.current?.focus()
    },
    onInsertMarkdown: (markdown) => setContent((prev) => prev + markdown),
    onRegisterPendingMedia: addPendingMedia,
  })

  const { handleImageUpload, handleVideoUpload } = useNoteAttachments({
    noteId: pendingNoteId.current,
    onUploadStart: () => setUploading(true),
    onUploadFinish: () => setUploading(false),
    onInsertMarkdown: (markdown) => setContent((prev) => prev + markdown),
    onFocus: () => textareaRef.current?.focus(),
    onRegisterPendingMedia: addPendingMedia,
  })

  const handleSave = async () => {
    if (!content.trim() && !title.trim()) return
    setSaving(true)
    const saved = await onCreate(title, content, pendingNoteId.current)
    await flushPendingMedia(saved.id)
    setTitle('')
    setContent('')
    pendingNoteId.current = crypto.randomUUID()
    resetPendingMedia()
    setSaving(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
  }

  const handleYouTubeEmbed = () => {
    const url = window.prompt('Paste a YouTube URL:')
    if (!url) return
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
    const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)
    const videoId = shortMatch?.[1] || watchMatch?.[1]
    if (!videoId) { alert('Could not extract a YouTube video ID from that URL.'); return }
    setContent((prev) => prev + `\n![youtube](https://youtube.com/watch?v=${videoId})\n`)
    textareaRef.current?.focus()
  }

  return (
    <div className="composer">
      <input className="composer-title" type="text" placeholder="Title (optional)"
        value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={handleKeyDown} />
      <textarea ref={textareaRef} className="composer-body" placeholder="What do you want to remember?"
        value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={handleKeyDown} autoFocus />
      <div className="composer-footer">
        <span className="composer-hint">⌘ enter to save</span>
        <div className="composer-actions-right">
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
          <button className="composer-icon-btn" onClick={() => fileInputRef.current?.click()} disabled={saving || uploading} title="Attach Image">
            {uploading ? '⏳' : '📷'}
          </button>
          <button className="composer-icon-btn" onClick={() => void handleVideoUpload()} disabled={saving || uploading} title="Attach Video">
            {uploading ? '⏳' : '🎬'}
          </button>
          <button className="composer-icon-btn" onClick={handleDocumentUpload} disabled={saving || uploading} title="Attach Document">
            {uploading ? '⏳' : '📄'}
          </button>
          <button className="composer-icon-btn" onClick={handleYouTubeEmbed} disabled={saving || uploading} title="Embed YouTube">
            ▶️
          </button>
          <button className="composer-save" onClick={handleSave} disabled={saving || (!content.trim() && !title.trim())}>
            {saving ? 'Saving…' : "That's my note →"}
          </button>
        </div>
      </div>
    </div>
  )
}
