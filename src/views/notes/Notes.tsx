import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import type { Note } from '../../types'
import { NoteItem } from '../../ui/editor/NoteItem'
import { NoteModal } from '../../ui/NoteModal'
import { eventBus } from '../../lib/eventBus'
import { getAllLinks } from '../../core/notes'
import { isAutoTag } from '../../core/tags'
import { useViewState } from '../../hooks/useViewState'
import { useFavourites } from '../../hooks/useFavourites'
import { useNotesViewPrefs, NOTES_PREFS_KEY } from './useNotesViewPrefs'
import { applyFilters, sortNotes, buildLinkCounts } from './filterNotes'
import { NotesToolbar } from './NotesToolbar'
import { NotesFilterBar } from './NotesFilterBar'
import { AddToWorkspaceMenu } from '../workspaces/AddToWorkspaceMenu'

import NoteStyles from './Notes.module.css'

function Notes() {
  const { notes, loading, error, update, remove, updateTags } = useNotesContext()
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const [workspaceMenuNoteId, setWorkspaceMenuNoteId] = useState<string | null>(null)
  const expandedNote = notes.find((note) => note.id === expandedNoteId)

  const prefs = useNotesViewPrefs(NOTES_PREFS_KEY)
  const [search, setSearch] = useViewState('notes.search', '')
  const [filtersOpen, setFiltersOpen] = useViewState('notes.filtersOpen', false)

  const { fetchFavourites, addToFavourites, removeFromFavourites } = useFavourites()
  const [favSet, setFavSet] = useState<Set<string>>(new Set())
  const [linkCounts, setLinkCounts] = useState<Map<string, number>>(new Map())

  // Open a note in the modal when a wikilink navigates here.
  useEffect(() => {
    const handler = (note: Note) => {
      eventBus.emit('note:opened', note)
      setExpandedNoteId(note.id)
    }
    eventBus.on('note:navigate', handler)
    return () => eventBus.off('note:navigate', handler)
  }, [])

  // Favourites — one bulk fetch, refreshed when a note is saved (the composer can
  // favourite on save). Toggling from a card updates the set optimistically.
  useEffect(() => {
    let active = true
    const refresh = () =>
      fetchFavourites()
        .then((ids) => { if (active) setFavSet(new Set(ids)) })
        .catch(() => {})
    refresh()
    eventBus.on('note:saved', refresh)
    return () => {
      active = false
      eventBus.off('note:saved', refresh)
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
        .catch(() => {})
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

  const toggleFavourite = useCallback(
    (id: string) => {
      setFavSet((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
          removeFromFavourites(id).catch(() => {})
        } else {
          next.add(id)
          addToFavourites(id).catch(() => {})
        }
        return next
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // All tags across notes (user tags first, then auto-tags), for the tag picker.
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const n of notes) for (const t of n.tags) set.add(t)
    return [...set].sort((a, b) => {
      const aAuto = isAutoTag(a)
      const bAuto = isAutoTag(b)
      if (aAuto !== bAuto) return aAuto ? 1 : -1
      return a.localeCompare(b)
    })
  }, [notes])

  const visible = useMemo(() => {
    const filtered = applyFilters(notes, prefs.filters, search, favSet, linkCounts)
    return sortNotes(filtered, prefs.sortBy, prefs.sortOrder, linkCounts)
  }, [notes, prefs.filters, prefs.sortBy, prefs.sortOrder, search, favSet, linkCounts])

  return (
    <div className={NoteStyles.notesContainer}>
      <NotesToolbar
        count={visible.length}
        total={notes.length}
        search={search}
        onSearch={setSearch}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
        prefsKey={NOTES_PREFS_KEY}
      />
      {filtersOpen && <NotesFilterBar allTags={allTags} prefsKey={NOTES_PREFS_KEY} />}

      <div className={NoteStyles.notesScroll}>
        {loading && <p className={NoteStyles.noteEmpty}>Loading...</p>}
        {!loading && error && <p className={NoteStyles.noteEmpty}>{error}</p>}
        {!loading && !error && notes.length === 0 && (
          <p className={NoteStyles.noteEmpty}>No notes yet.</p>
        )}
        {!loading && !error && notes.length > 0 && visible.length === 0 && (
          <p className={NoteStyles.noteEmpty}>No notes match your filters.</p>
        )}

        <div className={`${NoteStyles.list} ${NoteStyles[prefs.displayMode]}`}>
          {visible.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              variant={prefs.displayMode}
              isFavourite={favSet.has(note.id)}
              onToggleFavourite={() => toggleFavourite(note.id)}
              onUpdate={update}
              onRemove={remove}
              onAddToWorkspace={() => setWorkspaceMenuNoteId(note.id)}
              onExpand={() => {
                eventBus.emit('note:opened', note)
                setExpandedNoteId(note.id)
              }}
            />
          ))}
        </div>
      </div>

      {workspaceMenuNoteId && (
        <AddToWorkspaceMenu noteId={workspaceMenuNoteId} onClose={() => setWorkspaceMenuNoteId(null)} />
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
