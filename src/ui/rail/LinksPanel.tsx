// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The right-rail "Links" panel — backlinks (notes pointing here), outgoing
// links (this note's [[links]], canvas cards included) and the media the note
// embeds, for the focused Working Notes pane. Derived live from the draft via
// lib/noteLinks + core/markdown/noteMedia, so it updates as you type. Clicking a
// link opens the note (an unresolved one creates it); clicking media opens it.

import { useMemo, type ComponentType, type ReactNode } from 'react'
import { File, FileText, Film, Globe, Headphones, Image, Play, type LucideProps } from 'lucide-react'
import type { Note } from '../../types'
import { useActiveNote } from '../../lib/activeNote'
import { backlinks, outgoingLinks } from '../../lib/noteLinks'
import type { NoteMedia, NoteMediaKind } from '../../core/markdown/noteMedia'
import { noteMedia } from '../../lib/noteTypes'
import { openNoteMedia } from '../../core/media'
import { eventBus } from '../../lib/eventBus'
import { toast } from '../../lib/toast'
import styles from './RightRail.module.css'

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>
        {title} <span className={styles.linkCount}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function LinkList({ title, empty, rows }: { title: string; empty: string; rows: { key: string; label: string; note?: Note }[] }) {
  return (
    <Section title={title} count={rows.length}>
      {rows.length === 0 ? (
        <div className={styles.empty}>{empty}</div>
      ) : (
        <ul className={styles.linkList}>
          {rows.map((r) => (
            <li key={r.key}>
              <button
                className={r.note ? styles.linkRow : `${styles.linkRow} ${styles.linkRowMissing}`}
                title={r.note ? `Open “${r.label}”` : `Create “${r.label}”`}
                onClick={() =>
                  r.note
                    ? eventBus.emit('note:navigate', r.note)
                    : eventBus.emit('wikilink:create', { title: r.label })
                }
              >
                {r.label || 'Untitled'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

const MEDIA_ICON: Record<NoteMediaKind, ComponentType<LucideProps>> = {
  image: Image,
  video: Film,
  audio: Headphones,
  pdf: FileText,
  webpage: Globe,
  youtube: Play,
  document: File,
}

function MediaList({ media, noteId }: { media: NoteMedia[]; noteId: string }) {
  return (
    <Section title="Attached media" count={media.length}>
      {media.length === 0 ? (
        <div className={styles.empty}>No media in this note.</div>
      ) : (
        <ul className={styles.linkList}>
          {media.map((m) => {
            const Icon = MEDIA_ICON[m.kind]
            return (
              <li key={`${m.source}:${m.target}`}>
                <button
                  className={`${styles.linkRow} ${styles.mediaRow}`}
                  title={`Open ${m.kind}: ${m.label}`}
                  onClick={() =>
                    openNoteMedia(m, noteId).catch((err) => toast.error('Could not open: ' + String(err)))
                  }
                >
                  <Icon size={14} aria-hidden="true" />
                  <span className={styles.mediaLabel}>{m.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

export function LinksPanel() {
  const active = useActiveNote()
  const note = active?.note
  const allNotes = active?.allNotes

  // Recompute only when the linkable parts of the draft or the note list change.
  const data = useMemo(
    () =>
      note && allNotes
        ? {
            back: backlinks(note, allNotes),
            out: outgoingLinks(note, allNotes),
            media: noteMedia(note),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note?.id, note?.title, note?.content, note?.kind, note?.vaultId, allNotes],
  )

  if (!note || !data) return <div className={styles.empty}>Open a note in Working Notes to see its links.</div>

  return (
    <div className={styles.panelBody}>
      <LinkList
        title="Backlinks"
        empty={note.title.trim() ? 'No notes link here yet.' : 'Give this note a title so others can link to it.'}
        rows={data.back.map((n) => ({ key: n.id, label: n.title, note: n }))}
      />
      <LinkList
        title="Outgoing links"
        empty="No [[links]] in this note."
        rows={data.out.map((l) => ({ key: l.note?.id ?? `missing:${l.title}`, label: l.title, note: l.note }))}
      />
      <MediaList media={data.media} noteId={note.id} />
    </div>
  )
}
