import { useState, useRef } from 'react'
import type { Note } from '../../types'
import { uploadAsset } from '../../core/notes'

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