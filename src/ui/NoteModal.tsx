// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, useRef, useEffect } from 'react'
import { NoteView } from './editor/NoteRenderer'
import { getNoteType } from '../lib/noteTypes'
import type { Note } from '../types'
import { TagEditor } from './TagEditor'
import { isAutoTag } from '../core/tags'
import { useSidebarPrefs } from '../hooks/useSidebarPrefs'
import NoteModalStyles from './NoteModal.module.css'
import { useFavourites } from '../hooks/useFavourites'
import { exportNotes } from '../core/export'
import { setNoteProgress } from '../core/notes'
import { useNotesContext } from '../context/NotesContext'
import { ComposerSuggestions } from './ai/ComposerSuggestions'
import { eventBus } from '../lib/eventBus'
import { toast } from '../lib/toast'

interface Props {
  note: Note
  isOpen: boolean
  onClose: () => void
  /** Kept for the inline "add link" suggestion; editing itself moves to Working Notes. */
  onUpdate?: (id: string, title: string, content: string, tags?: string[]) => Promise<Note | undefined>
  onUpdateTags?: (id: string, userTags: string[]) => Promise<void>
}

/**
 * A lightweight, read-focused **peek** of a note — used from Home, Search, AI,
 * the Canvas board, and the workspace views where clicking a note shouldn't rip
 * you out of that context. Editing lives on the Notes → Working Notes desk;
 * "Edit in Working Notes ↗" emits `note:navigate`, which the global handler in
 * AppLayout turns into an open tab (routing to /notes as needed).
 */
export function NoteModal({ note, isOpen, onClose, onUpdate, onUpdateTags }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const maxProgressRef = useRef(0)
  // Guards click-to-close: only close when the press *started* on the backdrop
  // (a text-selection drag that ends over the backdrop shouldn't close it).
  const overlayPressRef = useRef(false)
  const { notes } = useNotesContext()
  const { collapsed: sidebarCollapsed } = useSidebarPrefs()
  const currentUserTags = note.tags.filter((t) => !isAutoTag(t))

  const { addToFavourites, removeFromFavourites, fetchFavourites } = useFavourites()
  const [isFavourite, setIsFavourite] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchFavourites().then(ids => setIsFavourite(ids.includes(note.id)))
    }
  }, [note.id, isOpen])

  useEffect(() => {
    setExpanded(false)
  }, [note])

  // Track reading progress (max scroll fraction) and persist on close/note change.
  useEffect(() => {
    maxProgressRef.current = 0
    const noteId = note.id
    const probe = window.setTimeout(() => {
      const el = bodyRef.current
      if (el && el.scrollHeight - el.clientHeight <= 4) maxProgressRef.current = 1
    }, 250)
    return () => {
      window.clearTimeout(probe)
      if (maxProgressRef.current > 0) void setNoteProgress(noteId, maxProgressRef.current)
    }
  }, [note.id])

  const handleBodyScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const scrollable = el.scrollHeight - el.clientHeight
    const frac = scrollable > 4 ? el.scrollTop / scrollable : 1
    if (frac > maxProgressRef.current) maxProgressRef.current = Math.min(1, frac)
  }

  const editInWorking = () => {
    eventBus.emit('note:navigate', note)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className={NoteModalStyles.noteModalOverlay}
      onMouseDown={(e) => { overlayPressRef.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (e.target === e.currentTarget && overlayPressRef.current) onClose()
        overlayPressRef.current = false
      }}
    >
      <div
        className={`${NoteModalStyles.noteModalContainer}${expanded ? ' ' + NoteModalStyles.expanded : ''}`}
        style={expanded ? { left: `var(${sidebarCollapsed ? '--sidebar-collapsed-width' : '--sidebar-width'})` } : undefined}
      >
        <div className={NoteModalStyles.noteModalTopLeftControls}>
          <div style={{ position: 'relative' }}>
            <button
              className={NoteModalStyles.noteModalEditBtn}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="More options"
              title="More options"
            >
              ⋮
            </button>
            {menuOpen && (
              <div className={`${NoteModalStyles.noteModalDropdown} ${NoteModalStyles.dropdownLeft}`}>
                <button
                  className={NoteModalStyles.noteModalDropdownItem}
                  onClick={async () => {
                    setMenuOpen(false)
                    if (isFavourite) {
                      await removeFromFavourites(note.id)
                      setIsFavourite(false)
                    } else {
                      await addToFavourites(note.id)
                      setIsFavourite(true)
                    }
                  }}
                >
                  {isFavourite ? '★ Remove from favourites' : '☆ Add to favourites'}
                </button>
                <button
                  className={NoteModalStyles.noteModalDropdownItem}
                  onClick={async () => {
                    setMenuOpen(false)
                    try {
                      const n = await exportNotes([note])
                      if (n) toast.success('Exported note as Markdown.')
                    } catch (err) {
                      toast.error('Export failed: ' + String(err))
                    }
                  }}
                >
                  ⤓ Download/Export
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={NoteModalStyles.noteModalTopControls}>
          <button
            className={NoteModalStyles.noteModalExpand}
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'Restore' : 'Expand to full screen'}
            title={expanded ? 'Restore' : 'Expand to full screen'}
          >
            {expanded ? '⤡' : '⤢'}
          </button>
          <button className={NoteModalStyles.noteModalClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={NoteModalStyles.noteModalContent}>
          <div className={NoteModalStyles.noteModalHeader}>
            <div className={NoteModalStyles.noteModalTitleWrapper}>
              <h2 className={NoteModalStyles.noteModalTitle}>{note.title || 'Untitled'}</h2>
            </div>
            <div className={NoteModalStyles.noteModalHeaderActions}>
              <button
                className={NoteModalStyles.noteModalEditBtn}
                onClick={editInWorking}
                aria-label="Edit in Working Notes"
                title="Edit in Working Notes"
              >
                ✎↗
              </button>
            </div>
          </div>
          <TagEditor
            tags={note.tags}
            onChange={(userTags) => onUpdateTags?.(note.id, userTags)}
            disabled
          />
          {!getNoteType(note) && <ComposerSuggestions
            note={note}
            allNotes={notes}
            currentTags={currentUserTags}
            onAddTag={onUpdateTags ? (tag) => onUpdateTags(note.id, [...currentUserTags, tag]) : undefined}
            onAddLink={
              onUpdate
                ? (linkTitle) => {
                    const wl = `[[${linkTitle}]]`
                    if (note.content.includes(wl)) return
                    onUpdate(note.id, note.title, `${note.content.trimEnd()}\n\n${wl}\n`)
                  }
                : undefined
            }
          />}
          <div className={NoteModalStyles.noteModalBody} ref={bodyRef} onScroll={handleBodyScroll}>
            <NoteView note={note} lazy={false} fullscreen />
          </div>
          <time className={NoteModalStyles.noteModalTime}>
            {new Date(note.updatedAt).toLocaleString()}
          </time>
        </div>
      </div>
    </div>
  )
}
