import { useEffect, useMemo, useState } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import { useWorkspaceNotes } from '../../hooks/useWorkspaceNotes'
import { getLastOpened } from '../../hooks/useSaveLastOpened'
import { getAllLinks } from '../../core/notes'
import { recentMedia } from '../../core/media'
import { eventBus } from '../../lib/eventBus'
import { NoteModal } from '../../ui/NoteModal'
import { StatCard } from '../home/dashboard/components/StatCard'
import { relativeTime, preview } from '../home/dashboard/format'
import type { Note, RecentMedia } from '../../types'
import styles from './Workspaces.module.css'

interface Props {
  workspaceId: string
  /** Switch the page to the Notes tab (used by empty-state / section links). */
  onGotoNotes: () => void
}

const TYPE_ICON: Record<string, string> = {
  image: '🖼️',
  video: '🎬',
  audio: '🎵',
  pdf: '📕',
  document: '📄',
}

/**
 * A per-workspace home — the same widgets as the global dashboard, but every
 * metric is derived from this workspace's notes only. Links are counted only
 * when *both* endpoints are in the workspace; imports / continue-learning are
 * intersected with membership. All data is already bulk-loaded elsewhere.
 */
export function WorkspaceDashboard({ workspaceId, onGotoNotes }: Props) {
  const { update, updateTags } = useNotesContext()
  const { notes, pinnedIds } = useWorkspaceNotes(workspaceId)

  const [links, setLinks] = useState<[string, string][]>([])
  const [imports, setImports] = useState<RecentMedia[]>([])
  const [openNote, setOpenNote] = useState<Note | null>(null)

  useEffect(() => {
    let active = true
    const refresh = () => {
      getAllLinks().then((l) => { if (active) setLinks(l) }).catch(() => {})
      recentMedia(40).then((m) => { if (active) setImports(m) }).catch(() => {})
    }
    refresh()
    const events = ['note:saved', 'note:deleted', 'link:created', 'link:removed']
    events.forEach((e) => eventBus.on(e, refresh))
    return () => {
      active = false
      events.forEach((e) => eventBus.off(e, refresh))
    }
  }, [])

  const scopeIds = useMemo(() => new Set(notes.map((n) => n.id)), [notes])

  const stats = useMemo(() => {
    const within = links.filter(([f, t]) => scopeIds.has(f) && scopeIds.has(t)).length
    const has = (tag: string) => notes.filter((n) => n.tags.includes(tag)).length
    return {
      notes: notes.length,
      links: within,
      pdfs: has('has:pdf'),
      audio: has('has:audio'),
      images: has('has:image'),
    }
  }, [notes, links, scopeIds])

  const pinned = useMemo(() => notes.filter((n) => pinnedIds.has(n.id)), [notes, pinnedIds])

  const recent = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
    [notes],
  )

  const continueLearning = useMemo(() => {
    const byId = new Map(notes.map((n) => [n.id, n]))
    return getLastOpened()
      .map(({ id, at }) => {
        const note = byId.get(id)
        return note ? { note, at } : null
      })
      .filter((x): x is { note: Note; at: number } => x !== null)
      .slice(0, 6)
  }, [notes])

  const recentImports = useMemo(
    () => imports.filter((m) => scopeIds.has(m.noteId)).slice(0, 6),
    [imports, scopeIds],
  )

  if (notes.length === 0) {
    return (
      <div className={styles.dashScroll}>
        <p className={styles.empty}>
          This workspace is empty. <button className={styles.linkBtn} onClick={onGotoNotes}>Add or create notes</button> to
          see its dashboard come to life.
        </p>
      </div>
    )
  }

  const openById = (id: string) => {
    const n = notes.find((x) => x.id === id)
    if (n) {
      eventBus.emit('note:opened', n)
      setOpenNote(n)
    }
  }

  return (
    <div className={styles.dashScroll}>
      <div className={styles.statGrid}>
        <StatCard icon="📝" label="Notes" value={stats.notes} accent="#7c6af7" />
        <StatCard icon="🔗" label="Links within" value={stats.links} accent="#3ba7f7" />
        <StatCard icon="📕" label="PDFs" value={stats.pdfs} accent="#e5484d" />
        <StatCard icon="🎵" label="Audio" value={stats.audio} accent="#3fb950" />
        <StatCard icon="🖼️" label="Images" value={stats.images} accent="#e3b341" />
      </div>

      <div className={styles.panels}>
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>📌 Pinned</h3>
          {pinned.length === 0 ? (
            <p className={styles.panelEmpty}>Pin a note (📍 on a card) to keep it here.</p>
          ) : (
            <div className={styles.noteList}>
              {pinned.map((n) => (
                <button key={n.id} className={styles.noteRow} onClick={() => openById(n.id)}>
                  <span className={styles.noteRowTitle}>{n.title || 'Untitled'}</span>
                  <span className={styles.noteRowMeta}>{preview(n.content, 60) || 'No content'}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>🕑 Recent activity</h3>
          <div className={styles.noteList}>
            {recent.map((n) => (
              <button key={n.id} className={styles.noteRow} onClick={() => openById(n.id)}>
                <span className={styles.noteRowTitle}>{n.title || 'Untitled'}</span>
                <span className={styles.noteRowMeta}>Edited {relativeTime(n.updatedAt)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>📖 Continue learning</h3>
          {continueLearning.length === 0 ? (
            <p className={styles.panelEmpty}>Open a note to start a session — it shows up here.</p>
          ) : (
            <div className={styles.noteList}>
              {continueLearning.map(({ note, at }) => (
                <button key={note.id} className={styles.noteRow} onClick={() => openById(note.id)}>
                  <span className={styles.noteRowTitle}>{note.title || 'Untitled'}</span>
                  <span className={styles.noteRowMeta}>Opened {relativeTime(at)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>📥 Recent imports</h3>
          {recentImports.length === 0 ? (
            <p className={styles.panelEmpty}>No imported files in this workspace yet.</p>
          ) : (
            <div className={styles.noteList}>
              {recentImports.map((m) => (
                <button key={m.filename} className={styles.noteRow} onClick={() => openById(m.noteId)}>
                  <span className={styles.noteRowTitle}>
                    {TYPE_ICON[m.mediaType] ?? '📎'} {m.noteTitle || 'Untitled'}
                  </span>
                  <span className={styles.noteRowMeta}>
                    {m.mediaType} · {relativeTime(m.createdAt)}
                  </span>
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
