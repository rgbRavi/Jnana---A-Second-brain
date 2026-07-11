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
import { MarkdownLite } from '../../../ui/editor/MarkdownLite'
import { LiveEditor, type LiveEditorHandle } from '../../../ui/editor/LiveEditor'
import { TagEditor } from '../../../ui/TagEditor'
import { ComposerToolbar } from '../../../ui/editor/ComposerToolbar'
import { FormatToolbar } from '../../../ui/editor/FormatToolbar'
import { FavouriteBtn } from '../../../ui/editor/FavouriteBtn'
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

  const editorRef = useRef<LiveEditorHandle>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const maxProgressRef = useRef(0)
  const saveTimer = useRef<number | undefined>(undefined)
  const seededFor = useRef<string | null>(null)
  // Latest draft, for the unmount flush (avoids stale-closure saves).
  const draftRef = useRef({ title, content, tags })
  draftRef.current = { title, content, tags }

  const { uploading, isRecording, toolbarProps } = useComposer({
    noteId,
    appendMarkdown: (md) => setContent((prev) => prev + md),
    focusTextarea: () => editorRef.current?.focus(),
  })
  const { toolbarProps: contextMenuImportProps } = useComposer({
    noteId,
    appendMarkdown: (md) => editorRef.current?.insertAtCursor(md),
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
          <FavouriteBtn noteId={note.id} />
          <button
            className={Styles.iconBtn}
            onClick={async () => {
              try {
                const n = await exportNotes([{ ...note, title, content }])
                if (n) toast.success('Exported note as Markdown.')
              } catch (err) {
                toast.error('Export failed: ' + String(err))
              }
            }}
            aria-label="Export note as Markdown"
            title="Export as Markdown"
          >
            ⤓
          </button>
          <button
            className={`${Styles.iconBtn} ${mode === 'read' ? Styles.iconBtnOn : ''}`}
            onClick={() => setMode((m) => (m === 'edit' ? 'read' : 'edit'))}
            aria-label={mode === 'edit' ? 'Reading view' : 'Editing view'}
            aria-pressed={mode === 'read'}
            title={mode === 'edit' ? 'Reading view' : 'Editing view'}
          >
            {mode === 'edit' ? '📖' : '✎'}
          </button>
        </div>
      </div>

      <TagEditor
        tags={tags}
        onChange={(newUserTags) => setTags([...tags.filter(isAutoTag), ...newUserTags])}
      />
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

      {mode === 'edit' ? (
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
            importHandlers={contextMenuImportProps}
          />
          <div className={Styles.toolbar}>
            <ComposerToolbar {...toolbarProps} disabled={uploading} />
            <FormatToolbar editorRef={editorRef} disabled={uploading} />
            {isRecording && <span className={Styles.recording}>● recording…</span>}
          </div>
        </>
      ) : (
        <div className={Styles.readBody} ref={bodyRef} onScroll={handleBodyScroll}>
          <MarkdownLite content={content} lazy={false} noteId={note.id} fullscreen />
          <time className={Styles.time}>{new Date(note.updatedAt).toLocaleString()}</time>
        </div>
      )}
    </div>
  )
}
