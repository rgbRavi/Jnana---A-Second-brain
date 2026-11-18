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
import { MoreVertical, SlidersHorizontal, Circle, BookOpen, PenLine } from 'lucide-react'
import { ContextMenu, type MenuItem } from '../../../ui/ContextMenu'
import { log } from '../../../lib/logger'
import { eventBus } from '../../../lib/eventBus'
import { openRailPanel, isRailHidden, getOpenRailPanel, useOpenRailPanel, useRailVisible } from '../../../ui/rail/RightRail'
import { setActiveNote, clearActiveNote, mayPublishActiveNote, useOwnsActiveNote } from '../../../lib/activeNote'
import { useLinkRename } from '../../../hooks/useLinkRename'
import { usePluginActions } from '../../../hooks/usePluginActions'
import { runPluginAction, type StoredAction } from '../../../lib/pluginActions'
import Styles from './EditorPane.module.css'
import { registerCloseFlush } from '../../../core/closeGuard'

const AUTOSAVE_MS = 800
/** A change unsaved this long means a save is overdue — only then do we warn. */
const OVERDUE_MS = 3000
const TOOLS_AUTO_KEY = 'jnana.noteTools.autoOpened.v1'
/** Wait before the nth automatic retry of a failed save (last value repeats). */
const RETRY_MS = [5000, 15000, 60000]

type Mode = 'edit' | 'read'
/** Read/Edit per note, so a tab switch (which unmounts the pane) doesn't reset it. */
const modeByNote = new Map<string, Mode>()

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
  // flushSave is memoized on [noteId, update] and also captured by the debounce
  // timer and the unmount flush, so it must read the *current* notes through a
  // ref — a closed-over `notes` would compare the draft against a stale copy.
  const notesRef = useRef(notes)
  notesRef.current = notes
  // What this pane last wrote (or seeded) — tells our own saves apart from
  // changes made to the note elsewhere.
  const lastSavedRef = useRef({ title: note?.title ?? '', content: note?.content ?? '' })
  // Title when the title field gained focus — the rename's "from" on blur.
  const titleAtFocusRef = useRef('')
  const offerLinkRename = useLinkRename()

  const [mode, setModeState] = useState<Mode>(() => modeByNote.get(noteId) ?? 'edit')
  const setMode = (m: Mode) => {
    modeByNote.set(noteId, m)
    setModeState(m)
  }
  const failsRef = useRef(0)
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'failed'>('saved')
  const [overdue, setOverdue] = useState(false)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  // The menu closes on any outside pointerdown, including the button's own;
  // remember that so the following click doesn't reopen it.
  const menuWasOpenRef = useRef(false)
  const saveFailToastedRef = useRef(false)
  const toolbarActions = usePluginActions('editor.toolbar')
  const menuActions = usePluginActions('note.menu')

  const { addToFavourites, removeFromFavourites, fetchFavourites } = useFavourites()
  const [isFavourite, setIsFavourite] = useState(false)

  useEffect(() => {
    if (noteId) {
      fetchFavourites().then(ids => setIsFavourite(ids.includes(noteId)))
    }
  }, [noteId])

  // Stay in step when the gallery/peek toggles this same note.
  useEffect(() => {
    const h = (p: { id: string; on: boolean }) => {
      if (p.id === noteId) setIsFavourite(p.on)
    }
    eventBus.on('favourite:changed', h)
    return () => eventBus.off('favourite:changed', h)
  }, [noteId])

  // Overdue = still unsaved/saving 3 s after the last edit. The timer restarts on
  // every edit, so steady typing (normal debounce) never turns the pill amber.
  useEffect(() => {
    setOverdue(false)
    if (status !== 'dirty' && status !== 'saving') return
    const t = window.setTimeout(() => setOverdue(true), OVERDUE_MS)
    return () => window.clearTimeout(t)
  }, [status, title, content, tags])

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
    const n = notesRef.current.find((x) => x.id === noteId)
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
      saveFailToastedRef.current = false
      failsRef.current = 0
      setStatus('saved')
    } catch (err) {
      log.error('Autosave failed', err)
      // One toast per failure streak, not one per keystroke-driven retry.
      if (!saveFailToastedRef.current) {
        saveFailToastedRef.current = true
        toast.error("Couldn't save this note. Your changes are still here; retrying automatically.")
      }
      failsRef.current += 1
      setStatus('failed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, update])

  // Window close doesn't unmount React, so the unmount flush below never runs —
  // flush through the close guard too. Ref keeps the latest flushSave.
  const flushRef = useRef(flushSave)
  flushRef.current = flushSave
  useEffect(() => registerCloseFlush(() => flushRef.current()), [])

  // Timed retry while a save is failing: 5s, 15s, then every 60s. Any status
  // change (an edit going dirty, a success, a manual retry) or unmount cancels it.
  useEffect(() => {
    if (status !== 'failed') return
    const t = window.setTimeout(
      () => void flushRef.current(),
      RETRY_MS[Math.min(failsRef.current - 1, RETRY_MS.length - 1)] ?? RETRY_MS[0],
    )
    return () => window.clearTimeout(t)
  }, [status])

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
    failsRef.current = 0
    setModeState(modeByNote.get(noteId) ?? 'edit')
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

  // First ever pane: open Note tools once so they're discoverable. The one-time
  // flag means a user who closes the panel is never overruled.
  useEffect(() => {
    try {
      if (localStorage.getItem(TOOLS_AUTO_KEY) || isRailHidden() || getOpenRailPanel() !== '') return
      localStorage.setItem(TOOLS_AUTO_KEY, '1')
      openRailPanel('note-tools')
    } catch {
      /* storage unavailable: skip the nudge */
    }
  }, [])

  const openPanel = useOpenRailPanel()
  const railVisible = useRailVisible()
  // Ownership via useOwnsActiveNote (a boolean snapshot), not useActiveNote():
  // this pane re-publishes every render, so subscribing to the state would loop.
  const ownsTools = useOwnsActiveNote(toolToken)
  const toolsOpen = railVisible && openPanel === 'note-tools' && ownsTools

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

  const saveView =
    status === 'failed'
      ? { state: 'failed', text: "Couldn't save", title: "Couldn't save — retry now" }
      : overdue
        ? { state: 'overdue', text: 'Not saved yet', title: 'Changes are taking a while to save' }
        : status === 'saved'
          ? { state: 'saved', text: 'Saved', title: 'All changes saved' }
          : { state: 'saving', text: 'Saving…', title: 'Saving…' }

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

  // A plugin acts on what's on screen: save pending edits first, or it reads
  // stale content and the pending autosave overwrites whatever it writes.
  const runAfterSave = async (a: StoredAction) => {
    window.clearTimeout(saveTimer.current)
    await flushSave()
    runPluginAction(a, { noteId })
  }

  const toggleFavourite = async () => {
    const next = !isFavourite
    setIsFavourite(next)
    try {
      if (next) await addToFavourites(note.id)
      else await removeFromFavourites(note.id)
    } catch (err) {
      setIsFavourite(!next)
      log.error('Toggling favourite failed', err)
      toast.error("Couldn't update favourites. Please try again.")
    }
  }

  const menuItems: MenuItem[] = [
    { label: isFavourite ? 'Remove from favourites' : 'Add to favourites', onClick: () => void toggleFavourite() },
    {
      label: 'Export',
      onClick: () =>
        void (async () => {
          try {
            toastExported(await exportNotes([{ ...note, title, content }]))
          } catch (err) {
            log.error('Export failed', err)
            toast.error("Couldn't export this note. Please try again.")
          }
        })(),
    },
    // Only a blank plain note can become a canvas: nothing to lose.
    ...(!noteType && content.trim() === ''
      ? [
          {
            label: 'Convert to canvas',
            onClick: () =>
              void (async () => {
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
                  log.error('Convert to canvas failed', err)
                  toast.error("Couldn't convert this note. Please try again.")
                }
              })(),
          },
        ]
      : []),
    ...menuActions.map((a) => ({ label: a.label, onClick: () => void runAfterSave(a) })),
    {
      label: 'Delete note',
      danger: true,
      separator: true,
      onClick: () =>
        void (async () => {
          window.clearTimeout(saveTimer.current)
          // Save pending edits first so a restore from Trash has them; then
          // block every later save, since the tab unmounts once the note leaves
          // the list and its flush must not resurrect it.
          await flushSave()
          deletedRef.current = true
          try {
            if (!(await remove(noteId))) deletedRef.current = false
          } catch (err) {
            deletedRef.current = false
            log.error('Delete note failed', err)
            toast.error("Couldn't delete this note. Please try again.")
          }
        })(),
    },
  ]

  return (
    <div
      data-anchor="editor"
      data-anchor-key={noteId}
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
          aria-label="Note title"
          spellCheck={false}
        />
        <div className={Styles.headerActions}>
          {isRecording && (
            <span className={Styles.recording} role="status">
              <Circle size={10} fill="currentColor" aria-hidden="true" /> Recording…
            </span>
          )}
          <button
            className={`${Styles.toolsBtn} ${toolsOpen ? Styles.iconBtnOn : ''}`}
            aria-pressed={toolsOpen}
            title="Tags, formatting, AI suggestions and media"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              publishRef.current()
              openRailPanel(toolsOpen ? '' : 'note-tools')
            }}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Tags &amp; tools
          </button>
          <button
            className={`${Styles.iconBtn} ${mode === 'read' ? Styles.iconBtnOn : ''}`}
            aria-pressed={mode === 'read'}
            aria-label="Reading view"
            title={mode === 'read' ? 'Edit' : 'Reading view'}
            onClick={() => setMode(mode === 'edit' ? 'read' : 'edit')}
          >
            {mode === 'read' ? <PenLine size={16} aria-hidden="true" /> : <BookOpen size={16} aria-hidden="true" />}
          </button>
          {toolbarActions.map((a) => (
            <button
              key={`${a.pluginId}:${a.id}`}
              className={Styles.iconBtn}
              onClick={() => void runAfterSave(a)}
              aria-label={a.label}
              title={`${a.label} — ${a.pluginName}`}
            >
              <span aria-hidden="true">{a.icon}</span>
            </button>
          ))}
          {status === 'failed' ? (
            <button
              className={`${Styles.status} ${Styles.statusBtn}`}
              data-state="failed"
              title={saveView.title}
              aria-label="Retry now"
              onClick={() => void flushSave()}
            >
              {saveView.text}
            </button>
          ) : (
            <span className={Styles.status} data-state={saveView.state} title={saveView.title}>
              {saveView.text}
            </span>
          )}
          {/* Only a failure is announced; cleared on the next success. */}
          <span className={Styles.srOnly} role="alert">
            {status === 'failed' ? "Couldn't save this note." : ''}
          </span>
          <button
            className={Styles.iconBtn}
            onPointerDown={() => {
              menuWasOpenRef.current = menuAt !== null
            }}
            onClick={(e) => {
              if (menuWasOpenRef.current) return setMenuAt(null)
              const r = e.currentTarget.getBoundingClientRect()
              setMenuAt({ x: r.right - 200, y: r.bottom + 4 })
            }}
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuAt !== null}
            title="More options"
          >
            <MoreVertical size={16} aria-hidden="true" />
          </button>
          {menuAt && <ContextMenu x={menuAt.x} y={menuAt.y} items={menuItems} onClose={() => setMenuAt(null)} />}
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
            placeholder="Note content…"
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
