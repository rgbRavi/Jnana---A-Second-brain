// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { memo, useRef, useLayoutEffect } from 'react'
import { MarkdownLite } from './MarkdownLite'
import { getNoteType, noteSearchText } from '../../lib/noteTypes'
import { truncateMarkdown } from '../../core/markdown/preview'
import type { Note } from '../../types'
import { isAutoTag } from '../../core/tags'
import { eventBus } from '../../lib/eventBus'
import { Pin, PinOff, Star, FolderPlus, PenLine, Trash2, Image, Film, Headphones, FileText, Link, Globe } from 'lucide-react'
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
  /** Part of the current multi-selection (accent ring). */
  selected?: boolean
  /**
   * Ctrl/Cmd-click ('toggle') or Shift-click ('range') on the card. Given this,
   * the card leaves modifier-clicks to the caller instead of opening the note.
   */
  onSelect?: (id: string, mode: 'toggle' | 'range') => void
}

/** Auto-tag → chip glyph + label, shown on non-default variants. */
const MEDIA_CHIPS: [string, React.ReactNode, string][] = [
  ['has:image', <Image size={12} />, 'Images'],
  ['has:videoOrYt', <Film size={12} />, 'Video'],
  ['has:audio', <Headphones size={12} />, 'Audio'],
  ['has:pdf', <FileText size={12} />, 'PDF'],
  ['has:docxlink', <Link size={12} />, 'Document'],
  ['has:webpage', <Globe size={12} />, 'Web page'],
]

function NoteItemImpl({
  note,
  onUpdate: _onUpdate,
  onRemove,
  onExpand,
  variant = 'card',
  isFavourite,
  onToggleFavourite,
  pinned,
  onTogglePin,
  removeTitle = 'Delete note',
  onAddToWorkspace,
  selected,
  onSelect,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const compact = variant === 'compact'
  const allUserTags = note.tags.filter((t) => !isAutoTag(t))
  const userTags = compact ? allUserTags.slice(0, 3) : allUserTags
  const mediaChips = MEDIA_CHIPS.filter(([tag]) => note.tags.includes(tag))
  const noteType = getNoteType(note)
  const showBody = !compact && !!note.content
  // A card is a preview, not the full note (that's the modal) — cap the body so
  // long notes don't each parse their entire content through react-markdown.
  // Deterministic, so MarkdownLite's memoized parse still holds across renders.
  // For a typed note the body is JSON, so preview its plain-text projection
  // (toSearchText) instead of parsing raw JSON — cheap, and never mounts the
  // type's interactive View in every card.
  const previewBody = truncateMarkdown(noteType ? noteSearchText(note) : note.content)

  // A video/audio-only note renders nothing inside the body (embeds are hidden
  // on cards), so collapse it rather than leave an empty gap.
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (el) el.hidden = !el.querySelector('img') && !el.textContent?.trim()
  }, [previewBody, showBody])

  return (
    <div
      data-anchor="note"
      data-anchor-key={note.id}
      className={`${Styles.noteCard} ${Styles[variant]} ${selected ? Styles.noteCardSelected : ''}`}
      onClick={(e) => {
        // Modifier-clicks build a selection; a plain click still opens the note.
        if (onSelect && (e.ctrlKey || e.metaKey)) {
          onSelect(note.id, 'toggle')
          return
        }
        if (onSelect && e.shiftKey) {
          // Stops the browser turning a Shift-click into a text selection
          // across the cards it spans.
          e.preventDefault()
          onSelect(note.id, 'range')
          return
        }
        onExpand?.(note)
      }}
    >
      <div className={Styles.noteCardHeader}>
        {/* A real button: the keyboard path to open (Enter, via the card's click
            handler) and select (Space; Shift+Space extends). Mouse users click the card. */}
        <button
          type="button"
          className={Styles.noteCardTitle}
          title={note.title || undefined}
          aria-label={`${note.title || 'Untitled'}${selected ? ', selected' : ''}`}
          onKeyDown={(e) => {
            if (onSelect && e.key === ' ') {
              e.preventDefault()
              onSelect(note.id, e.shiftKey ? 'range' : 'toggle')
            }
          }}
        >
          {note.title || 'Untitled'}
        </button>
        <div className={Styles.noteCardActions} onClick={(e) => e.stopPropagation()}>
          {onTogglePin && (
            <button
              className={`${Styles.noteCardAction} ${pinned ? Styles.noteCardFavOn : ''}`}
              onClick={() => onTogglePin(note.id)}
              aria-label="Pin to workspace"
              aria-pressed={pinned}
              title={pinned ? 'Unpin' : 'Pin in workspace'}
            >
              {pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
          )}
          {onToggleFavourite && (
            <button
              className={`${Styles.noteCardAction} ${isFavourite ? Styles.noteCardFavOn : ''}`}
              onClick={() => onToggleFavourite(note.id)}
              aria-label="Favourite"
              aria-pressed={isFavourite}
              title={isFavourite ? 'Unfavourite' : 'Favourite'}
            >
              {isFavourite ? <Star size={14} fill="currentColor" /> : <Star size={14} />}
            </button>
          )}
          {onAddToWorkspace && (
            <button
              className={Styles.noteCardAction}
              onClick={() => onAddToWorkspace(note.id)}
              aria-label="Add to workspace"
              title="Add to workspace"
            >
              <FolderPlus size={14} />
            </button>
          )}
          <button
            className={Styles.noteCardAction}
            onClick={() => eventBus.emit('note:navigate', note)}
            aria-label="Edit in Working Notes"
            title="Edit in Working Notes"
          >
            <PenLine size={14} />
          </button>
          <button
            className={Styles.noteCardDelete}
            onClick={() => onRemove(note.id)}
            aria-label={removeTitle}
            title={removeTitle}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {showBody && (
        <div ref={bodyRef} className={Styles.noteCardBody}>
          <MarkdownLite content={previewBody} noteId={note.id} />
        </div>
      )}
      <div className={Styles.noteCardMeta}>
        {noteType && (
          <span className={Styles.noteChip} role="img" title={noteType.label} aria-label={noteType.label}>
            {noteType.icon ? <noteType.icon size={12} /> : null}
            {noteType.label}
          </span>
        )}
        {mediaChips.map(([tag, glyph, label]) => (
          <span key={tag} className={Styles.noteChip} role="img" title={label} aria-label={label}>
            {glyph}
            {!compact && label}
          </span>
        ))}
        {userTags.map((t) => (
          <span key={t} className={Styles.noteTag}>
            {t}
          </span>
        ))}
        {pinned && (
          <span className={Styles.noteState} title="Pinned" role="img" aria-label="Pinned">
            <Pin size={12} />
          </span>
        )}
        {isFavourite && (
          <span className={Styles.noteState} title="Favourite" role="img" aria-label="Favourite">
            <Star size={12} fill="currentColor" />
          </span>
        )}
        <time className={Styles.noteCardTime}>{new Date(note.updatedAt).toLocaleDateString()}</time>
      </div>
    </div>
  )
}

/** Memoized so a save to one note doesn't re-render every other visible card —
 *  callers must pass stable (id-based) callbacks for this to actually bite;
 *  see Notes.tsx / WorkspaceNotes.tsx. */
export const NoteItem = memo(NoteItemImpl)
