// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Download, Folder, Trash2, X } from 'lucide-react'
import { useNotesContext } from '../../context/NotesContext'
import { DEFAULT_VAULT_ID, type Note } from '../../types'
import { useActiveVaultId } from '../../hooks/useVaults'
import { NoteItem } from '../../ui/editor/NoteItem'
import { NoteModal } from '../../ui/NoteModal'
import { eventBus } from '../../lib/eventBus'
import { getAllLinks } from '../../core/notes'
import { isAutoTag } from '../../core/tags'
import { useViewState } from '../../hooks/useViewState'
import { useFavourites } from '../../hooks/useFavourites'
import { openComposer } from '../../ui/editor/NoteCreator'
import { useNotesViewPrefs, resetNotesFilter, NOTES_PREFS_KEY } from './useNotesViewPrefs'
import { applyFilters, sortNotes, buildLinkCounts } from './filterNotes'
import { selectRange, toggleSelected } from './selection'
import { exportNotes, toastExported } from '../../core/export'
import { showConfirmDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import { log } from '../../lib/logger'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { formatChord } from '../../lib/pluginHotkeys'
import { NotesToolbar } from './NotesToolbar'
import { NotesFilterBar } from './NotesFilterBar'
import { AddToWorkspaceMenu } from '../workspaces/AddToWorkspaceMenu'
import { CANVAS_NOTE_KIND } from '../../plugins/canvas'
import { EMPTY_CANVAS_CONTENT } from '../../plugins/canvas/canvasNote'

import NoteStyles from './Notes.module.css'

// The list renders every visible card at once and each parses its markdown, so a
// large vault means a big synchronous burst on load. Render a page at a time and
// reveal more as the user scrolls to the bottom.
const PAGE = 24

/** Mounted only while a selection exists, so Esc is free otherwise. */
function ClearOnEscape({ onClear }: { onClear: () => void }) {
  useEscapeKey(onClear)
  return null
}

function Notes() {
  const { notes: allNotes, loading, error, reload, update, remove, updateTags, create } = useNotesContext()
  // The gallery is scoped to the active vault (Obsidian-style) — switching vaults
  // in the file explorer swaps which notes appear here.
  const activeVaultId = useActiveVaultId()
  const notes = useMemo(
    () => allNotes.filter((n) => (n.vaultId ?? DEFAULT_VAULT_ID) === activeVaultId),
    [allNotes, activeVaultId],
  )
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const [workspaceMenuNoteIds, setWorkspaceMenuNoteIds] = useState<string[] | null>(null)
  // Multi-selection: Ctrl/Cmd-click toggles, Shift-click extends from the last
  // card clicked. No checkboxes — a plain click still just opens the note.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectionAnchor = useRef<string | null>(null)
  const expandedNote = notes.find((note) => note.id === expandedNoteId)

  const prefs = useNotesViewPrefs(NOTES_PREFS_KEY)

  // Log the raw error; the UI shows a friendly message with a retry.
  useEffect(() => {
    if (error) log.error('Loading notes failed', error)
  }, [error])

  const newCanvas = useCallback(async () => {
    try {
      const note = await create('', EMPTY_CANVAS_CONTENT, undefined, [], CANVAS_NOTE_KIND)
      eventBus.emit('note:navigate', note)
    } catch {
      /* NotesContext surfaces its own errors */
    }
  }, [create])

  const [search, setSearch] = useViewState('notes.search', '')
  const [filtersOpen, setFiltersOpen] = useViewState('notes.filtersOpen', false)

  const { fetchFavourites, addToFavourites, removeFromFavourites } = useFavourites()
  const [favSet, setFavSet] = useState<Set<string>>(new Set())
  const [linkCounts, setLinkCounts] = useState<Map<string, number>>(new Map())

  // Favourites — one bulk fetch. Toggling from a card updates the set
  // optimistically, so the only case still needing a refetch is the composer's
  // "favourite on save" for a *new* note — re-fetching on every save of an
  // existing note (by far the common case) would be pure waste. `notesRef`
  // lets the handler tell create from update without re-subscribing per render.
  const notesRef = useRef(notes)
  notesRef.current = notes
  useEffect(() => {
    let active = true
    const refresh = () =>
      fetchFavourites()
        .then((ids) => { if (active) setFavSet(new Set(ids)) })
        .catch((err) => log.warn('Loading favourites failed', err))
    refresh()
    const handleSaved = (saved: Note) => {
      if (!notesRef.current.some((n) => n.id === saved.id)) refresh()
    }
    const handleFav = ({ id, on }: { id: string; on: boolean }) =>
      setFavSet((prev) => {
        if (prev.has(id) === on) return prev
        const next = new Set(prev)
        if (on) next.add(id)
        else next.delete(id)
        return next
      })
    eventBus.on('note:saved', handleSaved)
    eventBus.on('favourite:changed', handleFav)
    return () => {
      active = false
      eventBus.off('note:saved', handleSaved)
      eventBus.off('favourite:changed', handleFav)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Link graph (for orphan/linked filters + link-count sort) — bulk-loaded once,
  // refreshed on link/delete events.
  useEffect(() => {
    let active = true
    const refresh = () =>
      getAllLinks()
        .then((edges) => { if (active) setLinkCounts(buildLinkCounts(edges)) })
        .catch((err) => log.warn('Loading link counts failed', err))
    refresh()
    eventBus.on('link:created', refresh)
    eventBus.on('link:removed', refresh)
    eventBus.on('note:deleted', refresh)
    return () => {
      active = false
      eventBus.off('link:created', refresh)
      eventBus.off('link:removed', refresh)
      eventBus.off('note:deleted', refresh)
    }
  }, [])

  // Read the set through a ref so this callback stays stable — a new identity
  // per toggle would re-render every memoized card.
  const favSetRef = useRef(favSet)
  favSetRef.current = favSet
  const toggleFavourite = useCallback(
    (id: string) => {
      const adding = !favSetRef.current.has(id)
      const apply = (on: boolean) =>
        setFavSet((prev) => {
          const next = new Set(prev)
          if (on) next.add(id)
          else next.delete(id)
          return next
        })
      apply(adding)
      ;(adding ? addToFavourites(id) : removeFromFavourites(id))
        .catch((err) => {
          apply(!adding)
          log.error('Updating favourite failed', err)
          toast.error("Couldn't update favourites. Please try again.")
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Stable (id-based) handlers passed to every card — required for
  // React.memo(NoteItem) to actually skip re-rendering unrelated cards on save.
  // Clicking a card opens the read-focused peek modal; its "Edit in Working
  // Notes" button routes into the tabbed editor.
  const handleExpand = useCallback((note: Note) => {
    // Opening a note ends the selection — the same way a plain click clears a
    // selection in a file manager.
    setSelected(new Set())
    selectionAnchor.current = null
    eventBus.emit('note:opened', note)
    setExpandedNoteId(note.id)
  }, [])
  const handleAddToWorkspace = useCallback((id: string) => setWorkspaceMenuNoteIds([id]), [])

  // Selection is keyed off what's on screen, so a range follows the current
  // sort/filter order. `visibleIdsRef` keeps that out of the callback's deps.
  const visibleIdsRef = useRef<string[]>([])
  const handleSelect = useCallback((id: string, mode: 'toggle' | 'range') => {
    setSelected((prev) =>
      mode === 'toggle'
        ? toggleSelected(prev, id)
        : selectRange(prev, visibleIdsRef.current, selectionAnchor.current, id),
    )
    selectionAnchor.current = id
  }, [])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    selectionAnchor.current = null
  }, [])

  // One persistent live region: it exists before the text changes, so the first
  // "1 note selected" is announced.
  const selectionStatus = selected.size === 0 ? '' : `${selected.size} note${selected.size === 1 ? '' : 's'} selected`

  const selectedNotes = useMemo(() => notes.filter((n) => selected.has(n.id)), [notes, selected])

  const downloadSelected = useCallback(async () => {
    try {
      toastExported(await exportNotes(selectedNotes))
    } catch (err) {
      log.error('Export of selected notes failed', err)
      toast.error("Couldn't export the selected notes. Please try again.")
    }
  }, [selectedNotes])

  const deleteSelected = useCallback(async () => {
    const count = selectedNotes.length
    if (count === 0) return
    const ok = await showConfirmDialog({
      title: `Delete ${count} note${count === 1 ? '' : 's'}?`,
      message: 'They move to Trash — you can restore them from there.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    // confirm:false — the one dialog above stands in for all of them, instead of
    // asking once per note.
    const failed = new Set<string>()
    // remove() never throws: it puts a failed note back, logs, and resolves false.
    for (const n of selectedNotes) {
      if (!(await remove(n.id, { confirm: false, quiet: true }))) failed.add(n.id)
    }
    const done = count - failed.size
    if (failed.size === 0) {
      clearSelection()
      toast.success(`Moved ${count} note${count === 1 ? '' : 's'} to Trash.`)
      return
    }
    // Keep only the failures selected so the user can retry them.
    setSelected(failed)
    toast.error(
      done === 0
        ? `Couldn't move ${count === 1 ? 'the note' : `those ${count} notes`} to Trash.`
        : `Moved ${done} of ${count} notes to Trash; ${failed.size} couldn't be moved.`,
    )
  }, [selectedNotes, remove, clearSelection])

  // All user tags across notes, for the tag picker.
  const allTags = useMemo(() => {
    const set = new Set<string>()
    // Auto-tags (has:*, long-form) are internal; Status/Size chips cover them.
    // filterNotes still honours auto-tags in old saved include/exclude prefs.
    for (const n of notes) for (const t of n.tags) if (!isAutoTag(t)) set.add(t)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [notes])

  const visible = useMemo(() => {
    const filtered = applyFilters(notes, prefs.filters, search, favSet, linkCounts)
    return sortNotes(filtered, prefs.sortBy, prefs.sortOrder, linkCounts)
  }, [notes, prefs.filters, prefs.sortBy, prefs.sortOrder, search, favSet, linkCounts])

  visibleIdsRef.current = visible.map((n) => n.id)

  // A note that's been filtered away (or deleted) can't stay selected — the
  // action bar would count notes the user can no longer see.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const shown = new Set(visible.map((n) => n.id))
      const next = new Set([...prev].filter((id) => shown.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visible])

  // Incremental rendering. Reset the window when the *filter criteria* change —
  // not when `visible` merely gets a new identity from a note save, which would
  // otherwise snap a scrolled-down user back to the top on every autosave.
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => {
    setLimit(PAGE)
  }, [search, prefs.filters, prefs.sortBy, prefs.sortOrder])
  const shown = visible.slice(0, limit)

  // Grow the window when a sentinel below the last card nears the viewport.
  // Re-observing on each limit/length change re-checks intersection, so a short
  // page that leaves the sentinel visible keeps filling until it scrolls off.
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setLimit((l) => Math.min(l + PAGE, visible.length))
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible.length, limit])

  return (
    <div className={NoteStyles.notesContainer}>
      <NotesToolbar
        search={search}
        onSearch={setSearch}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
        prefsKey={NOTES_PREFS_KEY}
        newMenuItems={[{ label: 'New canvas', onClick: () => void newCanvas() }]}
      />
      {filtersOpen && <NotesFilterBar allTags={allTags} prefsKey={NOTES_PREFS_KEY} />}

      <div className={NoteStyles.notesScroll} data-anchor="notes.list">
        {loading && <p className={NoteStyles.noteEmpty}>Loading…</p>}
        {!loading && error && (
          <div className={NoteStyles.emptyState}>
            <p>Couldn't load your notes.</p>
            <button className={NoteStyles.emptyBtn} onClick={reload}>Try again</button>
          </div>
        )}
        {!loading && !error && notes.length === 0 && (
          <div className={NoteStyles.emptyState}>
            <p>No notes in this vault yet.</p>
            <button className={NoteStyles.emptyBtn} onClick={openComposer}>New note</button>
          </div>
        )}
        {!loading && !error && notes.length > 0 && visible.length === 0 && (
          <div className={NoteStyles.emptyState}>
            <p>No notes match your search or filters.</p>
            <button
              className={NoteStyles.emptyBtn}
              onClick={() => { resetNotesFilter(NOTES_PREFS_KEY); setSearch('') }}
            >
              Clear filters
            </button>
          </div>
        )}

        <span role="status" className={NoteStyles.srOnly}>{selectionStatus}</span>

        {/* The empty states above already say there's nothing — don't add "0 notes". */}
        {visible.length > 0 && (
          selected.size > 0 ? (
            <div className={NoteStyles.selectionBar}>
              <span className={NoteStyles.selectionCount}>{selected.size} selected</span>
              <button className={NoteStyles.selectionBtn} onClick={() => setWorkspaceMenuNoteIds([...selected])}>
                <Folder size={14} /> Add to workspace
              </button>
              <button className={NoteStyles.selectionBtn} onClick={() => void downloadSelected()}>
                <Download size={14} /> Export
              </button>
              <button
                className={`${NoteStyles.selectionBtn} ${NoteStyles.selectionBtnDanger}`}
                onClick={() => void deleteSelected()}
              >
                <Trash2 size={14} /> Delete
              </button>
              <button className={NoteStyles.selectionBtn} onClick={clearSelection} title="Clear selection (Esc)">
                <X size={14} /> Clear
              </button>
            </div>
          ) : (
            <p className={NoteStyles.listCount}>
              {visible.length === notes.length
                ? `${notes.length} note${notes.length === 1 ? '' : 's'}`
                : `${visible.length} of ${notes.length} notes`}
              <span className={NoteStyles.listHint}>{formatChord('mod')}-click or Space to select</span>
            </p>
          )
        )}
        <div className={`${NoteStyles.list} ${NoteStyles[prefs.displayMode]}`}>
          {shown.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              variant={prefs.displayMode}
              isFavourite={favSet.has(note.id)}
              onToggleFavourite={toggleFavourite}
              onUpdate={update}
              onRemove={remove}
              onAddToWorkspace={handleAddToWorkspace}
              onExpand={handleExpand}
              selected={selected.has(note.id)}
              onSelect={handleSelect}
            />
          ))}
        </div>
        {limit < visible.length && <div ref={sentinelRef} aria-hidden="true" />}
      </div>

      {selected.size > 0 && <ClearOnEscape onClear={clearSelection} />}

      {workspaceMenuNoteIds && (
        <AddToWorkspaceMenu noteIds={workspaceMenuNoteIds} onClose={() => setWorkspaceMenuNoteIds(null)} />
      )}

      {expandedNote && (
        <NoteModal
          note={expandedNote}
          isOpen={!!expandedNoteId}
          onClose={() => setExpandedNoteId(null)}
          onUpdate={update}
          onUpdateTags={updateTags}
        />
      )}
    </div>
  )
}

export default Notes
