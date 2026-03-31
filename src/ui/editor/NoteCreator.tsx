// src/ui/editor/NoteCreator.tsx
import { useState, useRef } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import type { Note } from '../../types'
import { uploadAsset } from '../../core/notes'
import { importVid, registerMediaRef } from '../../core/media'

interface Props {
  onCreate: (title: string, content: string, id?: string) => Promise<Note>
}

export function NoteCreator({ onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const pendingNoteId = useRef(crypto.randomUUID())
  const pendingVideos = useRef<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSave = async () => {
    if (!content.trim() && !title.trim()) return
    setSaving(true)
    const saved = await onCreate(title, content, pendingNoteId.current)
    for (const filename of pendingVideos.current) {
      await registerMediaRef(saved.id, 'video', filename).catch((err) => {
        console.error('registerMediaRef failed:', err)
      })
    }
    setTitle('')
    setContent('')
    pendingNoteId.current = crypto.randomUUID()
    pendingVideos.current = []
    setSaving(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const extension = file.name.split('.').pop() || 'png'
      const assetUrl = await uploadAsset(new Uint8Array(arrayBuffer), extension)
      setContent((prev) => prev + `\n![${file.name}](${assetUrl})\n`)
    } catch (err) {
      alert('Failed to upload image: ' + String(err))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      textareaRef.current?.focus()
    }
  }

  const handleVideoUpload = async () => {
    try {
      setUploading(true)
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'] }],
      })
      if (!selected || typeof selected !== 'string') return
      const filename = await importVid(selected, pendingNoteId.current)
      pendingVideos.current.push(filename)
      setContent((prev) => prev + (prev ? '\n' : '') + `![video](jnana-asset://${filename})` + '\n')
    } catch (err) {
      alert('Failed to upload video: ' + String(err))
    } finally {
      setUploading(false)
      textareaRef.current?.focus()
    }
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
          <input type="file" accept="image/*" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImageUpload} />
          <button className="composer-icon-btn" onClick={() => fileInputRef.current?.click()} disabled={saving || uploading} title="Attach Image">
            {uploading ? '⏳' : '📷'}
          </button>
          <button className="composer-icon-btn" onClick={handleVideoUpload} disabled={saving || uploading} title="Attach Video">
            {uploading ? '⏳' : '🎬'}
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
