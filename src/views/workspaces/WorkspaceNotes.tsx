import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import { NoteItem } from '../../ui/editor/NoteItem'
import { NoteModal } from '../../ui/NoteModal'
import { eventBus } from '../../lib/eventBus'
import { getAllLinks } from '../../core/notes'
import { isAutoTag } from '../../core/tags'
import { useViewState } from '../../hooks/useViewState'
import { useFavourites } from '../../hooks/useFavourites'
import { useWorkspaceNotes } from '../../hooks/useWorkspaceNotes'
import { useCollections } from '../../hooks/useCollections'
import { useNotesViewPrefs } from '../notes/useNotesViewPrefs'
import { applyFilters, sortNotes, buildLinkCounts } from '../notes/filterNotes'
import { NotesToolbar } from '../notes/NotesToolbar'
import { NotesFilterBar } from '../notes/NotesFilterBar'
import { AddNotesPicker } from './AddNotesPicker'
import { CollectionsBar } from './CollectionsBar'

import NoteStyles from '../notes/Notes.module.css'

/** Shared prefs key for every workspace's notes tab (kept separate from All-Notes). */
const PREFS_KEY = 'workspace'

interface Props {
  workspaceId: string
  /** Opens the (app-level) composer; new notes auto-add to the active workspace. */
  onNewNote: () => void
}

export function WorkspaceNotes({ workspaceId, onNewNote }: Props) {
  const { update, updateTags } = useNotesContext()
  const { notes, pinnedIds, removeNote, togglePin } = useWorkspaceNotes(workspaceId)
  const collectionsApi = useCollections(workspaceId)

  const prefs = useNotesViewPrefs(PREFS_KEY)
  const [search, setSearch] = useViewState('workspace.search', '')
  const [filtersOpen, setFiltersOpen] = useViewState('workspace.filtersOpen', false)
  const [collectionId, setCollectionId] = useViewState<string | null>('workspace.collection', null)
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const expandedNote = notes.find((n) => n.id === expandedNoteId)

  const { fetchFavourites, addToFavourites, removeFromFavourites } = useFavourites()
  const [favSet, setFavSet] = useState<Set<string>>(new Set())
  const [linkCounts, setLinkCounts] = useState<Map<string, number>>(new Map())

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

  // Narrow to the selected collection (if any) before the regular filters apply.
  const collMembers = collectionId ? collectionsApi.members.get(collectionId) ?? null : null
  const scopedNotes = useMemo(
    () => (collMembers ? notes.filter((n) => collMembers.has(n.id)) : notes),
    [notes, collMembers],
  )

  const visible = useMemo(() => {
    // Pinned notes float to the top, then the chosen sort applies within each group.
    const filtered = applyFilters(scopedNotes, prefs.filters, search, favSet, linkCounts)
    const sorted = sortNotes(filtered, prefs.sortBy, prefs.sortOrder, linkCounts)
    return [...sorted].sort((a, b) => Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)))
  }, [scopedNotes, prefs.filters, prefs.sortBy, prefs.sortOrder, search, favSet, linkCounts, pinnedIds])

  const existingIds = useMemo(() => new Set(notes.map((n) => n.id)), [notes])

  return (
    <div className={NoteStyles.notesContainer}>
      <NotesToolbar
        count={visible.length}
        total={scopedNotes.length}
        search={search}
        onSearch={setSearch}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
        prefsKey={PREFS_KEY}
        newLabel="✎ New note"
        onNew={onNewNote}
        extraActions={
          <button className={NoteStyles.addBtn} onClick={() => setPicking(true)}>
            ＋ Add notes
          </button>
        }
      />
      {filtersOpen && <NotesFilterBar allTags={allTags} prefsKey={PREFS_KEY} />}

      <CollectionsBar api={collectionsApi} notes={notes} activeId={collectionId} onSelect={setCollectionId} />

      <div className={NoteStyles.notesScroll}>
        {notes.length === 0 && (
          <p className={NoteStyles.noteEmpty}>
            No notes here yet — create one or add existing notes to this workspace.
          </p>
        )}
        {notes.length > 0 && scopedNotes.length === 0 && (
          <p className={NoteStyles.noteEmpty}>
            This collection is empty — use “Manage notes” to add some.
          </p>
        )}
        {scopedNotes.length > 0 && visible.length === 0 && (
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
              pinned={pinnedIds.has(note.id)}
              onTogglePin={() => togglePin(note.id)}
              onUpdate={update}
              onRemove={(id) => removeNote(id)}
              removeTitle="Remove from workspace"
              onExpand={() => {
                eventBus.emit('note:opened', note)
                setExpandedNoteId(note.id)
              }}
            />
          ))}
        </div>
      </div>

      {expandedNote && (
        <NoteModal
          note={expandedNote}
          isOpen={!!expandedNoteId}
          onClose={() => setExpandedNoteId(null)}
          onUpdate={update}
          onUpdateTags={updateTags}
        />
      )}

      {picking && (
        <AddNotesPicker
          workspaceId={workspaceId}
          existingIds={existingIds}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
