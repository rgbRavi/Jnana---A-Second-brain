// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, useRef, useEffect, useId } from 'react'
import { Maximize2, Minimize2, MoreVertical, SquarePen, X } from 'lucide-react'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { NoteView } from './editor/NoteRenderer'
import { getNoteType } from '../lib/noteTypes'
import type { Note } from '../types'
import { TagEditor } from './TagEditor'
import { isAutoTag } from '../core/tags'
import { useSidebarPrefs } from '../hooks/useSidebarPrefs'
import { useEscapeKey } from '../hooks/useEscapeKey'
import NoteModalStyles from './NoteModal.module.css'
import { useFavourites } from '../hooks/useFavourites'
import { exportNotes, toastExported } from '../core/export'
import { setNoteProgress } from '../core/notes'
import { useNotesContext } from '../context/NotesContext'
import { ComposerSuggestions } from './ai/ComposerSuggestions'
import { eventBus } from '../lib/eventBus'
import { toast } from '../lib/toast'
import { log } from '../lib/logger'

interface Props {
  note: Note
  isOpen: boolean
  onClose: () => void
  /** Kept for the inline "add link" suggestion; editing itself moves to Working Notes. */
  onUpdate?: (id: string, title: string, content: string, tags?: string[]) => Promise<Note | undefined>
  onUpdateTags?: (id: string, userTags: string[]) => Promise<void>
  /**
   * Viewing a note that's in Trash. It isn't editable, favouritable or
   * deletable-to-Trash from here — the menu offers Restore and Delete forever
   * instead, and the caller performs them (Trash owns its own list state).
   */
  trashActions?: {
    onRestore: () => void
    onDeleteForever: () => void
  }
}

/**
 * A lightweight, read-focused **peek** of a note — used from Home, Search, AI,
 * the Canvas board, and the workspace views where clicking a note shouldn't rip
 * you out of that context. Editing lives on the Notes → Working Notes desk;
 * "Edit in Working Notes ↗" emits `note:navigate`, which the global handler in
 * AppLayout turns into an open tab (routing to /notes as needed).
 */
export function NoteModal({ note, isOpen, onClose, onUpdate, onUpdateTags, trashActions }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const menuOpen = !!menuAt
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const maxProgressRef = useRef(0)
  // Guards click-to-close: only close when the press *started* on the backdrop
  // (a text-selection drag that ends over the backdrop shouldn't close it).
  const overlayPressRef = useRef(false)
  const { notes, remove } = useNotesContext()
  const { collapsed: sidebarCollapsed } = useSidebarPrefs()
  const currentUserTags = note.tags.filter((t) => !isAutoTag(t))

  // Escape closes the peek (only while open, and not while a sub-menu is up —
  // that closes on its own outside-press). Restore first if expanded.
  useEscapeKey(() => {
    if (!isOpen || menuOpen) return
    if (expanded) setExpanded(false)
    else onClose()
  })

  const { addToFavourites, removeFromFavourites, fetchFavourites } = useFavourites()
  const [isFavourite, setIsFavourite] = useState(false)

  useEffect(() => {
    if (isOpen && !trashActions) {
      fetchFavourites().then(ids => setIsFavourite(ids.includes(note.id)))
    }
  }, [note.id, isOpen, trashActions])

  useEffect(() => {
    setExpanded(false)
  }, [note])

  // Track reading progress (max scroll fraction) and persist on close/note change.
  // Pointless for a trashed note — it isn't in any "continue reading" list.
  useEffect(() => {
    if (trashActions) return
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

  const menuItems: MenuItem[] = [
    trashActions
      ? { label: 'Restore', onClick: trashActions.onRestore }
      : {
          label: isFavourite ? 'Remove from favourites' : 'Add to favourites',
          onClick: async () => {
            try {
              if (isFavourite) await removeFromFavourites(note.id)
              else await addToFavourites(note.id)
              setIsFavourite(!isFavourite)
            } catch (err) {
              log.error('Favourite toggle failed', err)
              toast.error("Couldn't update favourites. Please try again.")
            }
          },
        },
    {
      label: 'Export',
      onClick: async () => {
        try {
          toastExported(await exportNotes([note]))
        } catch (err) {
          log.error('Export from note preview failed', err)
          toast.error("Couldn't export this note. Please try again.")
        }
      },
    },
    trashActions
      ? { label: 'Delete forever', danger: true, separator: true, onClick: trashActions.onDeleteForever }
      : {
          label: 'Delete note',
          danger: true,
          separator: true,
          // `remove` runs the confirm dialog itself (per confirmBeforeDelete) and
          // reports whether it went ahead; only close the peek if the note went.
          onClick: async () => {
            if (await remove(note.id)) onClose()
          },
        },
  ]

  // Dialog focus: move in on open, restore to the opener on close.
  useEffect(() => {
    if (!isOpen) return
    const opener = document.activeElement as HTMLElement | null
    const root = dialogRef.current
    ;(root?.querySelector<HTMLElement>('[data-autofocus]') ?? root)?.focus({ preventScroll: true })
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [isOpen])

  // Trap Tab inside the dialog.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const f = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [],
    ).filter((el) => el.offsetParent !== null)
    if (!f.length) return
    const first = f[0], last = f[f.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === dialogRef.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        data-anchor="note"
        data-anchor-key={note.id}
        className={`${NoteModalStyles.noteModalContainer}${expanded ? ' ' + NoteModalStyles.expanded : ''}`}
        style={expanded ? { left: `var(${sidebarCollapsed ? '--sidebar-collapsed-width' : '--sidebar-width'})` } : undefined}
      >
        <div className={NoteModalStyles.noteModalContent}>
          <div className={NoteModalStyles.noteModalHeader}>
            <h2 id={titleId} className={NoteModalStyles.noteModalTitle}>{note.title || 'Untitled'}</h2>
            <div className={NoteModalStyles.noteModalHeaderActions}>
              {!trashActions && (
                <button className={NoteModalStyles.noteModalEditBtn} onClick={editInWorking} data-autofocus>
                  <SquarePen size={14} /> Edit in Working Notes
                </button>
              )}
              <button
                className={NoteModalStyles.noteModalIconBtn}
                onClick={() => setExpanded((e) => !e)}
                aria-label={expanded ? 'Restore' : 'Expand to full screen'}
                title={expanded ? 'Restore' : 'Expand to full screen'}
              >
                {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                className={NoteModalStyles.noteModalIconBtn}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setMenuAt(menuAt ? null : { x: r.right - 180, y: r.bottom + 4 })
                }}
                aria-label="More options"
                title="More options"
                aria-haspopup="menu"
                aria-expanded={!!menuAt}
              >
                <MoreVertical size={16} />
              </button>
              <button className={NoteModalStyles.noteModalIconBtn} onClick={onClose} title="Close" aria-label="Close">
                <X size={16} />
              </button>
            </div>
          </div>
          <TagEditor
            tags={note.tags}
            onChange={(userTags) => onUpdateTags?.(note.id, userTags)}
            disabled
            hideAutoTags
          />
          {!trashActions && !getNoteType(note) && <ComposerSuggestions
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
      {menuAt && <ContextMenu x={menuAt.x} y={menuAt.y} items={menuItems} onClose={() => setMenuAt(null)} />}
    </div>
  )
}
