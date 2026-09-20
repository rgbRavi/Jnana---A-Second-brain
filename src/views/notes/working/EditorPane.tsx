// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Note } from '../../../types'
import { useNotesContext } from '../../../context/NotesContext'
import { useComposer } from '../../../hooks/useComposer'
import { isAutoTag } from '../../../core/tags'
import { setNoteProgress, convertNoteKind } from '../../../core/notes'
import { CANVAS_NOTE_KIND } from '../../../plugins/canvas'
import { EMPTY_CANVAS_CONTENT } from '../../../plugins/canvas/canvasNote'
import { exportNotes, toastExported } from '../../../core/export'
import { toast } from '../../../lib/toast'
import { NoteView, NoteTypeEditor } from '../../../ui/editor/NoteRenderer'
import { getNoteType } from '../../../lib/noteTypes'
import { LiveEditor, type LiveEditorHandle } from '../../../ui/editor/LiveEditor'
import { useFavourites } from '../../../hooks/useFavourites'
import { MoreVertical, BookOpen, PenLine, Star, Download, LayoutDashboard, Trash2 } from 'lucide-react'
import { setActiveNote, clearActiveNote, mayPublishActiveNote } from '../../../lib/activeNote'
import { useLinkRename } from '../../../hooks/useLinkRename'
import Styles from './EditorPane.module.css'

const AUTOSAVE_MS = 800

function sameUserTags(a: string[], b: string[]): boolean {
  const ua = a.filter((t) => !isAutoTag(t))
  const ub = b.filter((t) => !isAutoTag(t))
  return ua.length === ub.length && ua.every((t, i) => t === ub[i])
}

/**
 * The full editing surface for one open note — the edit-mode half of the old
 * NoteModal lifted out of the overlay and given a full-height layout, a
 * read/edit toggle, and *debounced autosave* (the whole point of leaving the
 * click-Save modal behind). Autosave is scoped to Working Notes; NoteModal /
 * NoteItem keep their explicit-save behaviour. Only the *active* tab of a group
 * mounts an EditorPane, so N open tabs never means N live CM6 editors.
 */
export function EditorPane({ noteId }: { noteId: string }) {
  const { notes, update, remove } = useNotesContext()
  // Set once "Delete note" is confirmed — stops any later autosave/unmount flush.
  const deletedRef = useRef(false)
  const note = notes.find((n) => n.id === noteId)
  // What this pane last wrote (or seeded) — tells our own saves apart from
  // changes made to the note elsewhere.
  const lastSavedRef = useRef({ title: note?.title ?? '', content: note?.content ?? '' })
  // Title when the title field gained focus — the rename's "from" on blur.
  const titleAtFocusRef = useRef('')
  const offerLinkRename = useLinkRename()

  const [mode, setMode] = useState<'edit' | 'read'>('edit')
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving'>('saved')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { addToFavourites, removeFromFavourites, fetchFavourites } = useFavourites()
  const [isFavourite, setIsFavourite] = useState(false)

  useEffect(() => {
    if (noteId) {
      fetchFavourites().then(ids => setIsFavourite(ids.includes(noteId)))
    }
  }, [noteId])

  // Close the actions menu on outside pointerdown / Escape — matching the app's
  // other menus (ContextMenu, NoteModal dropdown).
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const editorRef = useRef<LiveEditorHandle>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const maxProgressRef = useRef(0)
  const saveTimer = useRef<number | undefined>(undefined)
  const seededFor = useRef<string | null>(null)
  // Latest draft, for the unmount flush (avoids stale-closure saves).
  const draftRef = useRef({ title, content, tags })
  draftRef.current = { title, content, tags }

  // Media/embeds insert at the editor's cursor (where the insertion bar is), not
  // appended to the end — so importing next to a table/paragraph lands there.
  // Falls back to appending only if the editor isn't mounted.
  const { uploading, isRecording, toolbarProps } = useComposer({
    noteId,
    appendMarkdown: (md) => {
      const handle = editorRef.current
      if (handle) handle.insertAtCursor(md)
      else setContent((prev) => prev + md)
    },
    focusTextarea: () => editorRef.current?.focus(),
  })

  const flushSave = useCallback(async () => {
    const n = notes.find((x) => x.id === noteId)
    if (!n || deletedRef.current) return
    const { title: t, content: c, tags: tg } = draftRef.current
    if (t === n.title && c === (n.content || '') && sameUserTags(tg, n.tags)) {
      setStatus('saved')
      return
    }
    setStatus('saving')
    try {
      await update(noteId, t.trim(), c.trim(), tg.filter((x) => !isAutoTag(x)))
      lastSavedRef.current = { title: t.trim(), content: c.trim() }
      setStatus('saved')
    } catch (err) {
      console.error('Autosave failed:', err)
      toast.error('Failed to save note.')
      setStatus('dirty')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, update])

  // Seed drafts when the pane switches to a different note. Deliberately keyed
  // on noteId only (not note identity) so our own autosave — which gives the
  // note a fresh object on every save — doesn't clobber in-flight edits.
  useEffect(() => {
    if (!note) return
    setTitle(note.title)
    setContent(note.content || '')
    setTags(note.tags)
    seededFor.current = noteId
    lastSavedRef.current = { title: note.title, content: note.content || '' }
    setStatus('saved')
    maxProgressRef.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // Adopt changes made to this note from *elsewhere* (e.g. a rename elsewhere
  // rewriting its [[links]]) while the draft has no unsaved edits — otherwise
  // the next autosave would write the stale draft back over them. Our own saves
  // match `lastSavedRef`, so they never trigger this.
  useEffect(() => {
    if (!note || seededFor.current !== noteId || status !== 'saved') return
    const last = lastSavedRef.current
    if (note.content !== last.content) setContent(note.content || '')
    if (note.title !== last.title) setTitle(note.title)
    lastSavedRef.current = { title: note.title, content: note.content || '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.content, note?.title, status])

  // Debounced autosave on any draft change.
  useEffect(() => {
    if (seededFor.current !== noteId || !note) return
    if (title === note.title && content === (note.content || '') && sameUserTags(tags, note.tags)) {
      return
    }
    setStatus('dirty')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void flushSave(), AUTOSAVE_MS)
    return () => window.clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, tags])

  // Flush pending edits + persist reading progress when the note changes or the
  // pane unmounts (tab closed / switched).
  useEffect(() => {
    const id = noteId
    return () => {
      window.clearTimeout(saveTimer.current)
      void flushSave()
      if (maxProgressRef.current > 0) void setNoteProgress(id, maxProgressRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // Publish this pane's tools to the right rail. The last pane pressed/focused
  // owns the rail (see the pane's capture handlers); otherwise re-publish every
  // render so the rail tracks live draft state.
  const toolToken = useRef({}).current
  const publishRef = useRef<() => void>(() => {})
  useEffect(() => {
    if (mayPublishActiveNote(toolToken)) publishRef.current()
  })
  useEffect(() => () => clearActiveNote(toolToken), [toolToken])

  const handleBodyScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const scrollable = el.scrollHeight - el.clientHeight
    const frac = scrollable > 4 ? el.scrollTop / scrollable : 1
    if (frac > maxProgressRef.current) maxProgressRef.current = Math.min(1, frac)
  }

  if (!note) {
    return <div className={Styles.missing}>This note is no longer available.</div>
  }

  const preview: Note = { ...note, title, content, tags }
  const noteType = getNoteType(note)

  publishRef.current = () =>
    setActiveNote(
      {
        note: preview,
        allNotes: notes,
        setUserTags: (userTags) => setTags((prev) => [...prev.filter(isAutoTag), ...userTags]),
        addTag: (tag) => setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag])),
        addLink: (linkTitle) => {
          const wl = `[[${linkTitle}]]`
          setContent((prev) => (prev.includes(wl) ? prev : `${prev.trimEnd()}\n\n${wl}\n`))
        },
        typed: !!noteType,
        editing: mode === 'edit' && !noteType,
        editorRef,
        toolbarProps,
        uploading,
      },
      toolToken,
    )

  return (
    <div
      className={Styles.pane}
      onPointerDownCapture={() => publishRef.current()}
      onFocusCapture={() => publishRef.current()}
    >
      <div className={Styles.header}>
        <input
          className={Styles.titleInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => {
            titleAtFocusRef.current = title
          }}
          onBlur={() => void offerLinkRename(noteId, titleAtFocusRef.current, title)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          placeholder="Title (optional)"
          spellCheck={false}
        />
        <div className={Styles.headerActions}>
          {isRecording && <span className={Styles.recording}>● recording…</span>}
          <span
            className={Styles.status}
            data-state={status}
            title={status === 'saving' ? 'Saving…' : status === 'dirty' ? 'Unsaved changes' : 'All changes saved'}
          >
            {status === 'saving' ? 'Saving…' : status === 'dirty' ? 'Unsaved' : 'Saved'}
          </span>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              className={Styles.iconBtn}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="More options"
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className={`${Styles.dropdown} ${Styles.dropdownRight}`} role="menu">
                <button
                  className={Styles.dropdownItem}
                  role="menuitem"
                  onClick={() => {
                    setMode((m) => (m === 'edit' ? 'read' : 'edit'))
                    setMenuOpen(false)
                  }}
                >
                  {mode === 'edit' ? <BookOpen size={16} /> : <PenLine size={16} />}
                  {mode === 'edit' ? 'Reading view' : 'Editing view'}
                </button>
                <button
                  className={Styles.dropdownItem}
                  role="menuitem"
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
                  <Star size={16} fill={isFavourite ? 'currentColor' : 'none'} />
                  {isFavourite ? 'Remove from favourites' : 'Add to favourites'}
                </button>
                <button
                  className={Styles.dropdownItem}
                  role="menuitem"
                  onClick={async () => {
                    setMenuOpen(false)
                    try {
                      toastExported(await exportNotes([{ ...note, title, content }]))
                    } catch (err) {
                      toast.error('Export failed: ' + String(err))
                    }
                  }}
                >
                  <Download size={16} />
                  Download / Export
                </button>
                {/* Only a blank plain note can become a canvas — nothing to lose. */}
                {!noteType && content.trim() === '' && (
                  <button
                    className={Styles.dropdownItem}
                    role="menuitem"
                    onClick={async () => {
                      setMenuOpen(false)
                      window.clearTimeout(saveTimer.current)
                      try {
                        await flushSave()
                        if (await convertNoteKind(noteId, CANVAS_NOTE_KIND, EMPTY_CANVAS_CONTENT)) {
                          setContent(EMPTY_CANVAS_CONTENT)
                          if (!title.trim()) setTitle('Canvas')
                        } else {
                          toast.error('Only a blank note can be converted to a canvas.')
                        }
                      } catch (err) {
                        toast.error('Convert failed: ' + String(err))
                      }
                    }}
                  >
                    <LayoutDashboard size={16} />
                    Convert to canvas
                  </button>
                )}
                <button
                  className={`${Styles.dropdownItem} ${Styles.dropdownItemDanger}`}
                  role="menuitem"
                  onClick={async () => {
                    setMenuOpen(false)
                    window.clearTimeout(saveTimer.current)
                    // Save pending edits first so a restore from Trash has them;
                    // then block every later save — the tab unmounts once the note
                    // leaves the list, and its flush must not resurrect it.
                    await flushSave()
                    deletedRef.current = true
                    try {
                      if (!(await remove(noteId))) deletedRef.current = false
                    } catch (err) {
                      deletedRef.current = false
                      toast.error('Delete failed: ' + String(err))
                    }
                  }}
                >
                  <Trash2 size={16} />
                  Delete note
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tags, AI suggestions, media + formatting live in the right rail's
          "Note tools" panel (NoteToolsPanel), fed through lib/activeNote. */}
      {mode === 'edit' ? (
        noteType ? (
          <div className={Styles.typedFill}>
            <NoteTypeEditor note={note} value={content} onChange={setContent} />
          </div>
        ) : (
          <LiveEditor
            ref={editorRef}
            className={Styles.editor}
            placeholder="Note content..."
            value={content}
            onChange={setContent}
            onSubmit={() => void flushSave()}
            notes={notes}
            noteId={note.id}
            allowNavigate
            importHandlers={toolbarProps}
          />
        )
      ) : (
        <div className={Styles.readBody} ref={bodyRef} onScroll={handleBodyScroll}>
          <NoteView note={note} content={content} lazy={false} fullscreen />
          <time className={Styles.time}>{new Date(note.updatedAt).toLocaleString()}</time>
        </div>
      )}
    </div>
  )
}
