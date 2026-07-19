// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Note } from '../../../types'
import { useNotesContext } from '../../../context/NotesContext'
import { useComposer } from '../../../hooks/useComposer'
import { isAutoTag } from '../../../core/tags'
import { setNoteProgress } from '../../../core/notes'
import { exportNotes } from '../../../core/export'
import { toast } from '../../../lib/toast'
import { NoteView, NoteTypeEditor } from '../../../ui/editor/NoteRenderer'
import { getNoteType } from '../../../lib/noteTypes'
import { LiveEditor, type LiveEditorHandle } from '../../../ui/editor/LiveEditor'
import { TagEditor } from '../../../ui/TagEditor'
import { ComposerToolbar } from '../../../ui/editor/ComposerToolbar'
import { FormatToolbar } from '../../../ui/editor/FormatToolbar'
import { useFavourites } from '../../../hooks/useFavourites'
import { MoreVertical, BookOpen, PenLine, Star, Download } from 'lucide-react'
import { ComposerSuggestions } from '../../../ui/ai/ComposerSuggestions'
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
  const { notes, update } = useNotesContext()
  const note = notes.find((n) => n.id === noteId)

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
    if (!n) return
    const { title: t, content: c, tags: tg } = draftRef.current
    if (t === n.title && c === (n.content || '') && sameUserTags(tg, n.tags)) {
      setStatus('saved')
      return
    }
    setStatus('saving')
    try {
      await update(noteId, t.trim(), c.trim(), tg.filter((x) => !isAutoTag(x)))
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
    setStatus('saved')
    maxProgressRef.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

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

  const currentUserTags = tags.filter((t) => !isAutoTag(t))
  const preview: Note = { ...note, title, content, tags }
  const noteType = getNoteType(note)

  return (
    <div className={Styles.pane}>
      <div className={Styles.header}>
        <input
          className={Styles.titleInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          spellCheck={false}
        />
        <div className={Styles.headerActions}>
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
                      const n = await exportNotes([{ ...note, title, content }])
                      if (n) toast.success('Exported note as Markdown.')
                    } catch (err) {
                      toast.error('Export failed: ' + String(err))
                    }
                  }}
                >
                  <Download size={16} />
                  Download / Export
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <TagEditor
        tags={tags}
        onChange={(newUserTags) => setTags([...tags.filter(isAutoTag), ...newUserTags])}
      />
      {/* AI suggestions read note content as prose — skip for typed (JSON) notes. */}
      {!noteType && (
        <ComposerSuggestions
          note={preview}
          allNotes={notes}
          currentTags={currentUserTags}
          onAddTag={(tag) => setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]))}
          onAddLink={(linkTitle) => {
            const wl = `[[${linkTitle}]]`
            setContent((prev) => (prev.includes(wl) ? prev : `${prev.trimEnd()}\n\n${wl}\n`))
          }}
        />
      )}

      {mode === 'edit' ? (
        noteType ? (
          <div className={Styles.readBody}>
            <NoteTypeEditor note={note} value={content} onChange={setContent} />
          </div>
        ) : (
          <>
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
            <div className={Styles.toolbar}>
              <ComposerToolbar {...toolbarProps} disabled={uploading} />
              <FormatToolbar editorRef={editorRef} disabled={uploading} />
              {isRecording && <span className={Styles.recording}>● recording…</span>}
            </div>
          </>
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
