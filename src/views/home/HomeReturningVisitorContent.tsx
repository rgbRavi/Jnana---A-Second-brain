import { useState, useRef, useEffect, useMemo } from 'react'
import { useFavourites } from "../../hooks/useFavourites"
import { NoteCreator } from "../../ui/editor/NoteCreator"
import { NoteModal } from "../../ui/NoteModal"
import { useNotesContext } from '../../context/NotesContext'
import { getLastOpenedIds } from '../../hooks/useSaveLastOpened'
import { useSearch } from '../../hooks/useSearch'
import type { Note } from '../../types'
import ContentStyles from "./HomeReturningVisitorContent.module.css"

// ── Shared card strip ─────────────────────────────────────────────────────────

type CardStripProps = {
  notes: Note[]
  update: (id: string, title: string, content: string, userTags?: string[]) => Promise<Note | undefined>
  updateTags: (noteId: string, userTags: string[]) => Promise<void>
  scrollable?: boolean
}

function CardStrip({ notes, update, updateTags, scrollable }: CardStripProps) {
  const [openNote, setOpenNote] = useState<Note | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -240 : 240, behavior: 'smooth' })
  }

  return (
    <>
      <div className={ContentStyles.recentCards} ref={scrollable ? scrollRef : undefined}>
        {notes.map((note) => (
          <div
            key={note.id}
            className={ContentStyles.recentCard}
            onClick={() => setOpenNote(note)}
          >
            <span className={ContentStyles.recentCardTitle}>{note.title || 'Untitled'}</span>
            {note.content && (
              <p className={ContentStyles.recentCardPreview}>
                {note.content.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim().slice(0, 150)}
              </p>
            )}
            <time className={ContentStyles.recentCardTime}>
              {new Date(note.updatedAt).toLocaleString()}
            </time>
          </div>
        ))}
      </div>
      {scrollable && (
        <div className={ContentStyles.scrollButtons}>
          <button onClick={() => scroll('left')}>⬅</button>
          <button onClick={() => scroll('right')}>➡</button>
        </div>
      )}
      {openNote && (
        <NoteModal
          note={openNote}
          isOpen
          onClose={() => setOpenNote(null)}
          onUpdate={update}
          onUpdateTags={updateTags}
        />
      )}
    </>
  )
}

// ── Recent section ────────────────────────────────────────────────────────────

function DisplayLastSessionCards() {
  const { notes, update, updateTags } = useNotesContext()

  const recentNotes = getLastOpenedIds()
    .map((id) => notes.find((n) => n.id === id))
    .filter((n): n is Note => !!n)

  if (recentNotes.length === 0) return null

  return <CardStrip notes={recentNotes} update={update} updateTags={updateTags} scrollable />
}

// ── Favourites section ────────────────────────────────────────────────────────

const INITIAL_ROWS = 4

function DisplayFavourites() {
  const [favouriteNoteIds, setFavouriteNoteIds] = useState<string[]>([])
  const { fetchFavourites } = useFavourites()
  const { notes, update, updateTags } = useNotesContext()
  const [isExpanded, setIsExpanded] = useState(false)
  const [openNote, setOpenNote] = useState<Note | null>(null)

  useEffect(() => {
    fetchFavourites().then(setFavouriteNoteIds)
  }, [])

  const favouriteNotes = useMemo(
    () => favouriteNoteIds.map((id) => notes.find((n) => n.id === id)).filter((n): n is Note => !!n),
    [favouriteNoteIds, notes]
  )

  const { query, results, search } = useSearch(favouriteNotes)

  useEffect(() => { setIsExpanded(false) }, [query])

  const displayNotes = query.trim()
    ? results.map(r => favouriteNotes.find(n => n.id === r.id)).filter((n): n is Note => !!n)
    : favouriteNotes

  const visible = (query.trim() || isExpanded) ? displayNotes : displayNotes.slice(0, INITIAL_ROWS)
  const hiddenCount = displayNotes.length - INITIAL_ROWS

  if (favouriteNotes.length === 0) {
    return <p className={ContentStyles.emptyHint}>No favourites yet — star a note to pin it here.</p>
  }

  return (
    <>
      <div className={ContentStyles.favouritesHeader}>
        <input
          className={ContentStyles.favouriteSearch}
          placeholder="Search favourites…"
          value={query}
          onChange={e => search(e.target.value)}
        />
      </div>
      <div className={ContentStyles.favouriteCards}>
        {visible.map(note => (
          <div
            key={note.id}
            className={ContentStyles.recentCard}
            onClick={() => setOpenNote(note)}
          >
            <span className={ContentStyles.recentCardTitle}>{note.title || 'Untitled'}</span>
            {note.content && (
              <p className={ContentStyles.recentCardPreview}>
                {note.content.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim().slice(0, 150)}
              </p>
            )}
            <time className={ContentStyles.recentCardTime}>
              {new Date(note.updatedAt).toLocaleString()}
            </time>
          </div>
        ))}
        {displayNotes.length === 0 && query.trim() && (
          <p className={ContentStyles.emptyHint}>No matching favourites.</p>
        )}
      </div>
      {!query.trim() && !isExpanded && hiddenCount > 0 && (
        <button className={ContentStyles.showMoreBtn} onClick={() => setIsExpanded(true)}>
          Show {hiddenCount} more
        </button>
      )}
      {!query.trim() && isExpanded && (
        <button className={ContentStyles.showMoreBtn} onClick={() => setIsExpanded(false)}>
          Show less
        </button>
      )}
      {openNote && (
        <NoteModal
          note={openNote}
          isOpen
          onClose={() => setOpenNote(null)}
          onUpdate={update}
          onUpdateTags={updateTags}
        />
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function HomeReturningVisitorContent() {
  const { create, update } = useNotesContext()
  return (
    <div className={ContentStyles.contentContainer}>
      <h1>Welcome Back to Jnana!</h1>
      <NoteCreator onCreate={create} onUpdate={update} />
      <h2>Resume Where you left off…</h2>
      <DisplayLastSessionCards />
      <h2>Favourites</h2>
      <DisplayFavourites />
    </div>
  )
}

export default HomeReturningVisitorContent
