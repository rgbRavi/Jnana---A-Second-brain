import { useState, useRef } from 'react'
import type { Note } from '../../types'

interface Props {
  onCreate: (title: string, content: string) => Promise<Note>
}

export function NoteCreator({ onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
        <button
          className="composer-save"
          onClick={handleSave}
          disabled={saving || (!content.trim() && !title.trim())}
        >
          {saving ? 'Saving…' : "That's my note →"}
        </button>
      </div>
    </div>
  )
}