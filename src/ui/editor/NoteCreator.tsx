import { useState, useRef } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import type { Note } from '../../types'
import { uploadAsset } from '../../core/notes'
import { importVid } from '../../core/media'

interface Props {
  onCreate: (title: string, content: string) => Promise<Note>
}

export function NoteCreator({ onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSave = async () => {
    if (!content.trim() && !title.trim()) return
    setSaving(true)
    await onCreate(title, content)
    setTitle('')
    setContent('')
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
      const imageMarkdown = `\n![${file.name}](${assetUrl})\n`
      setContent((prev) => prev + imageMarkdown)
    } catch (err) {
      console.error('Failed to upload image:', err)
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
        filters: [
          {
            name: 'Video',
            extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'],
          },
        ],
      })

      if (!selected || typeof selected !== 'string') return

      // For new notes, we need to save first to get an ID
      let noteId: string
      if (title.trim() || content.trim()) {
        // Note has content, but might not be saved yet - create temp note to get ID
        setSaving(true)
        const createdNote = await onCreate(title || 'Untitled', content)
        setSaving(false)
        noteId = createdNote.id
        // Clear the form after auto-save
        setTitle('')
        setContent('')
      } else {
        // Empty note - create untitled placeholder
        setSaving(true)
        const createdNote = await onCreate('Untitled', '')
        setSaving(false)
        noteId = createdNote.id
      }

      // Now import the video with the note ID
      const filename = await importVid(selected, noteId)

      // Inject markdown
      const videoMarkdown = `![video](jnana-asset://${filename})`
      setContent((prev) => prev + (prev ? '\n' : '') + videoMarkdown + '\n')
    } catch (err) {
      console.error('Failed to upload video:', err)
      alert('Failed to upload video: ' + String(err))
    } finally {
      setUploading(false)
      textareaRef.current?.focus()
    }
  }

  const handleYouTubeEmbed = () => {
    const url = window.prompt('Paste a YouTube URL:')
    if (!url) return

    // Extract video ID
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

  return (
    <div className="composer">
      <input
        className="composer-title"
        type="text"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <textarea
        ref={textareaRef}
        className="composer-body"
        placeholder="What do you want to remember?"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <div className="composer-footer">
        <span className="composer-hint">⌘ enter to save</span>
        <div className="composer-actions-right">
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleImageUpload}
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
            onClick={handleVideoUpload}
            disabled={saving || uploading}
            title="Attach Video"
          >
            {uploading ? '⏳' : '🎬'}
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
            className="composer-save"
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