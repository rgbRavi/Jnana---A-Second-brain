// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, useRef, useEffect, useCallback } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Note } from '../../types'
import { useViewState } from '../../hooks/useViewState'
import { useComposer } from '../../hooks/useComposer'
import { usePendingMedia } from '../../hooks/usePendingMedia'
import { useFavourites } from '../../hooks/useFavourites'
import { useComposerOptions, getComposerOptions } from '../../hooks/useComposerOptions'
import { useNotesContext } from '../../context/NotesContext'
import { eventBus } from '../../lib/eventBus'
import { getActiveWorkspaceId } from '../../hooks/useActiveWorkspace'
import { addWorkspaceNote } from '../../core/workspaces'
import { TagEditor } from '../TagEditor'
import { ComposerSuggestions } from '../ai/ComposerSuggestions'
import { AddContentMenu } from './AddContentMenu'
import { FormatToolbar } from './FormatToolbar'
import { LiveEditor, type LiveEditorHandle } from './LiveEditor'
import Styles from './NoteCreator.module.css'
import FavStyles from './FavouriteBtn.module.css'

interface Props {
  onCreate: (title: string, content: string, id?: string, tags?: string[]) => Promise<Note>
  onUpdate: (id: string, title: string, content: string, tags?: string[]) => Promise<Note | undefined>
}

type ComposerState = 'collapsed' | 'expanded' | 'fullscreen'

const LAST_STATE_KEY = 'jnana.composer.lastState'

// Latched open intent. The composer is route-gated (mounted only on Home/Notes),
// so a `composer:open` emitted right after navigating to /notes can fire before
// this component mounts. We set the latch alongside the event; a freshly-mounted
// composer reads it so the intent isn't lost. Use openComposer() from anywhere.
let pendingOpen = false

/** Expand the floating composer and focus it (one-click capture entry point). */
export function openComposer(): void {
  pendingOpen = true
  eventBus.emit('composer:open', null)
}

/** Seed the open state from localStorage (only when "remember last state" is on). */
function initialComposerState(): ComposerState {
  if (!getComposerOptions().rememberState) return 'collapsed'
  try {
    return localStorage.getItem(LAST_STATE_KEY) === 'expanded' ? 'expanded' : 'collapsed'
  } catch {
    return 'collapsed'
  }
}

/**
 * The floating note composer: a compact "Click to take a note" pill that expands
 * into a bottom sheet (⅓ height) and can be maximized to fill the content area.
 * Mounted once at the app level (AppLayout) and shown on the Home & Notes views.
 */
export function NoteCreator({ onCreate, onUpdate }: Props) {
  // Draft fields persist across view switches so an in-progress note isn't lost.
  const [title, setTitle] = useViewState('notes.composer.title', '')
  const [content, setContent] = useViewState('notes.composer.content', '')
  const [tags, setTags] = useViewState<string[]>('notes.composer.tags', [])
  const [saveFavourite, setSaveFavourite] = useViewState('notes.composer.favourite', false)
  const [state, setState] = useViewState<ComposerState>('notes.composer.state', initialComposerState)
  const [saving, setSaving] = useState(false)
  // Bumped on save to remount the AI suggestion panels, clearing their results.
  const [draftKey, setDraftKey] = useState(0)
  const [options] = useComposerOptions()
  const { addToFavourites } = useFavourites()

  const pendingNoteId = useRef(crypto.randomUUID())
  const editorRef = useRef<LiveEditorHandle>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  // Latest title, read inside the (stable) composer:open handler without re-subscribing.
  const titleValRef = useRef(title)
  titleValRef.current = title
  const { addPendingMedia, flushPendingMedia, resetPendingMedia } = usePendingMedia()
  const { notes } = useNotesContext()

  const { uploading, isRecording, toolbarProps } = useComposer({
    noteId: pendingNoteId.current,
    appendMarkdown: (md) => setContent((prev) => prev + md),
    focusTextarea: () => editorRef.current?.focus(),
    onRegisterPendingMedia: addPendingMedia,
  })
  // A second instance just for the editor's right-click "Import" submenu —
  // same upload plumbing, but inserts land at the click position instead of
  // always appending to the end.
  const { toolbarProps: contextMenuImportProps } = useComposer({
    noteId: pendingNoteId.current,
    appendMarkdown: (md) => editorRef.current?.insertAtCursor(md),
    focusTextarea: () => editorRef.current?.focus(),
    onRegisterPendingMedia: addPendingMedia,
  })

  const draftNote: Note = {
    id: pendingNoteId.current,
    title,
    content,
    tags,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  const open = state !== 'collapsed'

  // Focus the editor when the composer opens.
  useEffect(() => {
    if (state === 'collapsed') return
    const t = window.setTimeout(() => editorRef.current?.focus(), 60)
    return () => window.clearTimeout(t)
  }, [state])

  // Quick-note capture: expand and drop the cursor straight in. Reopens the
  // in-progress draft rather than resetting it. Focuses the title for a fresh
  // note, or the body when a draft already has a title.
  const runOpen = useCallback(() => {
    setState('expanded')
    window.setTimeout(() => {
      if (titleValRef.current.trim()) editorRef.current?.focus()
      else titleRef.current?.focus()
    }, 70)
  }, [setState])

  useEffect(() => {
    const handler = () => {
      pendingOpen = false
      runOpen()
    }
    eventBus.on('composer:open', handler)
    // Catch an open intent latched before this (route-gated) composer mounted.
    if (pendingOpen) {
      pendingOpen = false
      runOpen()
    }
    return () => eventBus.off('composer:open', handler)
  }, [runOpen])

  // Remember collapsed/expanded across reloads (fullscreen is transient).
  useEffect(() => {
    if (!options.rememberState) return
    if (state === 'collapsed' || state === 'expanded') {
      try {
        localStorage.setItem(LAST_STATE_KEY, state)
      } catch {
        /* storage unavailable */
      }
    }
  }, [state, options.rememberState])

  const handleSave = async () => {
    if (!content.trim() && !title.trim()) return
    setSaving(true)
    const saved = await onCreate(title, content, pendingNoteId.current, tags)
    await flushPendingMedia(saved.id)
    await onUpdate(saved.id, saved.title, saved.content, tags)
    if (saveFavourite) await addToFavourites(saved.id)
    // When captured from inside a workspace, file the new note there too.
    const wsId = getActiveWorkspaceId()
    if (wsId) await addWorkspaceNote(wsId, saved.id).catch(() => {})
    setTitle('')
    setContent('')
    setTags([])
    setSaveFavourite(false)
    pendingNoteId.current = crypto.randomUUID()
    resetPendingMedia()
    setDraftKey((k) => k + 1)
    setSaving(false)
    editorRef.current?.focus()
  }

  const handleCancel = () => setState((s) => (s === 'fullscreen' ? 'expanded' : 'collapsed'))

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  // Pasting an image attaches it inline, same as the ＋ menu's upload — plain
  // text keeps the browser's native paste.
  const handleBodyPaste = (e: ClipboardEvent) => {
    const file = Array.from(e.clipboardData?.items ?? [])
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile()
    if (!file) return
    e.preventDefault()
    void toolbarProps.onImageUpload(file)
  }

  const pillAlpha = Math.max(0, Math.min(1, (100 - options.transparency) / 100))
  const pillStyle: CSSProperties = {
    // color-mix against --surface directly (not the --surface-rgb companion var) so
    // this can't drift out of sync with whatever Theme Studio currently has applied.
    background: `color-mix(in srgb, var(--surface) ${Math.round(pillAlpha * 100)}%, transparent)`,
    backdropFilter: options.glass ? 'blur(12px)' : undefined,
    WebkitBackdropFilter: options.glass ? 'blur(12px)' : undefined,
  }

  return (
    <div className={`${Styles.dock} ${Styles[state]}`}>
      {/* Collapsed pill */}
      <button
        type="button"
        className={Styles.pill}
        style={pillStyle}
        onClick={() => setState('expanded')}
        aria-label="Take a note"
        inert={open}
      >
        <span className={Styles.pillIcon} aria-hidden="true">
          ✎
        </span>
        Click to take a note
      </button>

      {/* Expanded / fullscreen panel */}
      <div className={Styles.panel} aria-label="Note composer" onKeyDown={handleKeyDown} inert={!open}>
        <div className={Styles.header}>
          <button
            type="button"
            className={FavStyles.favouriteBtn}
            onClick={() => setSaveFavourite((v) => !v)}
            title={saveFavourite ? 'Remove from favourites on save' : 'Add to favourites on save'}
          >
            {saveFavourite ? '★' : '☆'}
          </button>
          <div className={Styles.headerRight}>
            <button
              type="button"
              className={Styles.headerBtn}
              onClick={() => setState((s) => (s === 'fullscreen' ? 'expanded' : 'fullscreen'))}
              title={state === 'fullscreen' ? 'Restore' : 'Maximize'}
            >
              {state === 'fullscreen' ? '⤡' : '⤢'}
            </button>
            <button
              type="button"
              className={Styles.headerBtn}
              onClick={() => setState('collapsed')}
              title="Collapse"
            >
              ✕
            </button>
          </div>
        </div>

        <input
          ref={titleRef}
          className={Styles.title}
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className={Styles.tagSection}>
          <TagEditor tags={tags} onChange={setTags} />
        </div>
        <div className={Styles.suggestRow}>
          <ComposerSuggestions
            key={draftKey}
            note={draftNote}
            allNotes={notes}
            currentTags={tags}
            onAddTag={(tag) => setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]))}
            onAddLink={(linkTitle) => {
              const wl = `[[${linkTitle}]]`
              setContent((prev) => (prev.includes(wl) ? prev : `${prev.trimEnd()}\n\n${wl}\n`))
            }}
          />
        </div>

        <LiveEditor
          ref={editorRef}
          className={Styles.bodyEditor}
          placeholder="What do you want to remember?"
          value={content}
          onChange={setContent}
          onSubmit={() => void handleSave()}
          onCancel={handleCancel}
          onPaste={handleBodyPaste}
          notes={notes}
          noteId={pendingNoteId.current}
          allowNavigate={false}
          importHandlers={contextMenuImportProps}
        />

        <div className={Styles.footer}>
          <AddContentMenu {...toolbarProps} disabled={saving || uploading} />
          <FormatToolbar editorRef={editorRef} disabled={saving || uploading} />
          <span className={Styles.hint}>⌘ enter to save</span>
          <span
            className={Styles.saveWrap}
            title={isRecording ? 'Finish recording before save' : undefined}
          >
            <button
              type="button"
              className={Styles.save}
              onClick={handleSave}
              disabled={saving || isRecording || (!content.trim() && !title.trim())}
            >
              {saving ? 'Saving…' : "That's my note →"}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
