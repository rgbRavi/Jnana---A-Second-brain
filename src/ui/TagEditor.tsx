import { useState, useRef, KeyboardEvent } from 'react'
import { isAutoTag } from '../core/tags'

interface Props {
  /** All tags on the note (auto + user) */
  tags: string[]
  /** Called when the user adds or removes a tag — receives only user tags */
  onChange: (userTags: string[]) => void
  disabled?: boolean
}

export function TagEditor({ tags, onChange, disabled }: Props) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const userTags = tags.filter((t) => !isAutoTag(t))
  const autoTags = tags.filter(isAutoTag)

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-')
    if (!tag || isAutoTag(tag) || userTags.includes(tag)) return
    onChange([...userTags, tag])
    setInput('')
  }

  const removeTag = (tag: string) => {
    onChange(userTags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    }
    if (e.key === 'Backspace' && input === '' && userTags.length > 0) {
      removeTag(userTags[userTags.length - 1])
    }
  }

  return (
    <div
      className="tag-editor"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Auto-generated tags — read only */}
      {autoTags.map((tag) => (
        <span key={tag} className="tag-chip tag-chip--auto" title="Auto-generated tag">
          {tag}
        </span>
      ))}

      {/* User tags — removable */}
      {userTags.map((tag) => (
        <span key={tag} className="tag-chip tag-chip--user">
          {tag}
          {!disabled && (
            <button
              className="tag-chip-remove"
              onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
              aria-label={`Remove tag ${tag}`}
            >
              ×
            </button>
          )}
        </span>
      ))}

      {/* Input */}
      {!disabled && (
        <input
          ref={inputRef}
          className="tag-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(input)}
          placeholder={tags.length === 0 ? 'Add tags…' : ''}
          spellCheck={false}
        />
      )}
    </div>
  )
}
