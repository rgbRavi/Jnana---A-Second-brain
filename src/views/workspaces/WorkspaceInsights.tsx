import { useEffect, useMemo, useState } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import { useWorkspaceNotes } from '../../hooks/useWorkspaceNotes'
import { getAllLinks } from '../../core/notes'
import { getIndexStats, getIndexTimes, staleNotes } from '../../core/ai'
import { isAutoTag } from '../../core/tags'
import { eventBus } from '../../lib/eventBus'
import { NoteModal } from '../../ui/NoteModal'
import type { Note } from '../../types'
import styles from './Workspaces.module.css'

interface Props {
  workspaceId: string
}

interface Pair {
  a: Note
  b: Note
  tag: string
}

/**
 * Workspace health, scoped to its notes. Orphans/untagged are exact; "needs
 * indexing" reuses the RAG staleness check (only when indexing is in use);
 * "suggested links" are unlinked in-workspace pairs sharing a user tag — a fast,
 * AI-free heuristic (same one the global dashboard counts).
 */
export function WorkspaceInsights({ workspaceId }: Props) {
  const { update, updateTags } = useNotesContext()
  const { notes } = useWorkspaceNotes(workspaceId)

  const [links, setLinks] = useState<[string, string][]>([])
  const [staleIds, setStaleIds] = useState<Set<string>>(new Set())
  const [indexed, setIndexed] = useState(0)
  const [openNote, setOpenNote] = useState<Note | null>(null)

  const scopeIds = useMemo(() => new Set(notes.map((n) => n.id)), [notes])

  useEffect(() => {
    let active = true
    const refresh = () => {
      getAllLinks().then((l) => { if (active) setLinks(l) }).catch(() => {})
      Promise.all([getIndexStats().catch(() => ({ chunkCount: 0, indexedNoteCount: 0 })), getIndexTimes().catch(() => [])])
        .then(([stats, times]) => {
          if (!active) return
          setIndexed(stats.indexedNoteCount)
          setStaleIds(new Set(staleNotes(notes, times).map((n) => n.id)))
        })
        .catch(() => {})
    }
    refresh()
    const events = ['note:saved', 'note:deleted', 'link:created', 'link:removed', 'workspace:changed']
    events.forEach((e) => eventBus.on(e, refresh))
    return () => {
      active = false
      events.forEach((e) => eventBus.off(e, refresh))
    }
    // notes identity drives staleNotes; refresh re-reads the latest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])

  const { orphans, untagged, needsIndexing, suggested } = useMemo(() => {
    const inLinks = links.filter(([f, t]) => scopeIds.has(f) && scopeIds.has(t))
    const degree = new Map<string, number>()
    const linkedKey = new Set<string>()
    for (const [f, t] of inLinks) {
      degree.set(f, (degree.get(f) ?? 0) + 1)
      degree.set(t, (degree.get(t) ?? 0) + 1)
      linkedKey.add(f < t ? `${f}|${t}` : `${t}|${f}`)
    }

    const orphans = notes.filter((n) => !degree.get(n.id))
    const untagged = notes.filter((n) => n.tags.filter((t) => !isAutoTag(t)).length === 0)
    const needsIndexing = notes.filter((n) => staleIds.has(n.id))

    // Suggested links: unlinked in-workspace pairs sharing a user tag.
    const byId = new Map(notes.map((n) => [n.id, n]))
    const tagIndex = new Map<string, string[]>()
    for (const n of notes) {
      for (const t of n.tags) {
        if (isAutoTag(t)) continue
        const arr = tagIndex.get(t) ?? []
        arr.push(n.id)
        tagIndex.set(t, arr)
      }
    }
    const seenPair = new Set<string>()
    const suggested: Pair[] = []
    for (const [tag, ids] of tagIndex) {
      if (ids.length < 2 || ids.length > 25) continue
      for (let i = 0; i < ids.length && suggested.length < 10; i++) {
        for (let j = i + 1; j < ids.length && suggested.length < 10; j++) {
          const a = ids[i]
          const b = ids[j]
          const key = a < b ? `${a}|${b}` : `${b}|${a}`
          if (linkedKey.has(key) || seenPair.has(key)) continue
          seenPair.add(key)
          const na = byId.get(a)
          const nb = byId.get(b)
          if (na && nb) suggested.push({ a: na, b: nb, tag })
        }
      }
    }

    return { orphans, untagged, needsIndexing, suggested }
  }, [notes, links, scopeIds, staleIds])

  const open = (n: Note) => {
    eventBus.emit('note:opened', n)
    setOpenNote(n)
  }

  if (notes.length === 0) {
    return (
      <div className={styles.dashScroll}>
        <p className={styles.empty}>Add notes to this workspace to see insights.</p>
      </div>
    )
  }

  return (
    <div className={styles.dashScroll}>
      <div className={styles.panels}>
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>🌱 Orphans · {orphans.length}</h3>
          {orphans.length === 0 ? (
            <p className={styles.panelEmpty}>Every note links to another here. ✨</p>
          ) : (
            <div className={styles.noteList}>
              {orphans.slice(0, 12).map((n) => (
                <button key={n.id} className={styles.noteRow} onClick={() => open(n)}>
                  <span className={styles.noteRowTitle}>{n.title || 'Untitled'}</span>
                  <span className={styles.noteRowMeta}>No links within this workspace</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>🏷 Untagged · {untagged.length}</h3>
          {untagged.length === 0 ? (
            <p className={styles.panelEmpty}>All notes are tagged. ✨</p>
          ) : (
            <div className={styles.noteList}>
              {untagged.slice(0, 12).map((n) => (
                <button key={n.id} className={styles.noteRow} onClick={() => open(n)}>
                  <span className={styles.noteRowTitle}>{n.title || 'Untitled'}</span>
                  <span className={styles.noteRowMeta}>Add tags to make it findable</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>🧠 Needs indexing · {needsIndexing.length}</h3>
          {indexed === 0 ? (
            <p className={styles.panelEmpty}>Semantic indexing isn’t set up — enable it in Settings → AI.</p>
          ) : needsIndexing.length === 0 ? (
            <p className={styles.panelEmpty}>All notes are up to date in the index. ✨</p>
          ) : (
            <div className={styles.noteList}>
              {needsIndexing.slice(0, 12).map((n) => (
                <button key={n.id} className={styles.noteRow} onClick={() => open(n)}>
                  <span className={styles.noteRowTitle}>{n.title || 'Untitled'}</span>
                  <span className={styles.noteRowMeta}>Edited since last embedded</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>🔗 Suggested links · {suggested.length}</h3>
          {suggested.length === 0 ? (
            <p className={styles.panelEmpty}>No obvious missing links — notes sharing a tag are already linked.</p>
          ) : (
            <div className={styles.noteList}>
              {suggested.map(({ a, b, tag }) => (
                <button key={`${a.id}|${b.id}`} className={styles.noteRow} onClick={() => open(a)}>
                  <span className={styles.noteRowTitle}>
                    {a.title || 'Untitled'} ↔ {b.title || 'Untitled'}
                  </span>
                  <span className={styles.noteRowMeta}>Both tagged {tag} but not linked</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {openNote && (
        <NoteModal
          note={openNote}
          isOpen={!!openNote}
          onClose={() => setOpenNote(null)}
          onUpdate={update}
          onUpdateTags={updateTags}
        />
      )}
    </div>
  )
}
