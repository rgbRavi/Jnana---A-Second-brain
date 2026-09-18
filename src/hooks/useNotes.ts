// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/hooks/useNotes.ts
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { noteLinkText } from '../lib/noteTypes'
import { DEFAULT_VAULT_ID, type Note } from '../types/index'
import { notesLinkingTo } from '../lib/noteLinks'
import { getAllNotes, saveNote, trashNote, syncLinksForNote } from '../core/notes'
import { inferTags, isAutoTag } from '../core/tags'
import { getActiveVaultId } from './useVaults'
import { getGeneralSettings } from './useGeneralSettings'
import { showConfirmDialog } from '../lib/dialog'
import { eventBus } from '../lib/eventBus'
import { log } from '../lib/logger'

// Bump when link resolution changes so stored edges are rebuilt once: v1 made
// links vault-scoped (and live-notes-only) and gave canvases real links.
const LINK_RESYNC_KEY = 'jnana.links.resync.v1'

/** Re-derive every note's outbound links once per LINK_RESYNC_KEY — edges are
 *  otherwise only rebuilt when a note is saved. Sequential: one IPC at a time.
 *  ponytail: runs every note through Rust's title scan (O(n²)); fine once. */
async function resyncAllLinksOnce(notes: Note[]): Promise<void> {
  try {
    if (localStorage.getItem(LINK_RESYNC_KEY)) return
  } catch {
    return
  }
  const titles = new Map(notes.map((n) => [n.id, n.title]))
  const titleOf = (id: string) => titles.get(id)
  try {
    for (const n of notes) await syncLinksForNote(n.id, noteLinkText(n, titleOf))
    localStorage.setItem(LINK_RESYNC_KEY, String(Date.now()))
  } catch (err) {
    log.error('One-time link resync failed (will retry next launch)', err)
  }
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const notesRef = useRef(notes)
  notesRef.current = notes
  const syncedTitles = useRef(new Map<string, string>())

  // Load all notes on mount
  useEffect(() => {
    getAllNotes()
      .then((fetched) => {
        setNotes(fetched)
        setLoading(false)
        for (const n of fetched) syncedTitles.current.set(n.id, n.title)
        void resyncAllLinksOnce(fetched)
      })
      .catch((err) => {
        // Don't leave the list hung on "Loading…" with no signal.
        log.error('Failed to load notes', err)
        setError('Could not load your notes.')
        setLoading(false)
      })
  }, [])

  // Stay in sync when any note is saved — optimistic update already applied
  // locally, but this handles saves from other parts of the app too.
  
  useEffect(() => {
    const handler = (saved: Note) => {
      setNotes((prev) => {
        const exists = prev.find((n) => n.id === saved.id)
        if (exists) return prev.map((n) => (n.id === saved.id ? saved : n))
        return [saved, ...prev]
      })
    }
    eventBus.on('note:saved', handler)
    return () => eventBus.off('note:saved', handler)
  }, [])

  // Reflect virtual-folder moves in memory. `setNoteFolder` only touches
  // `folder_id` Rust-side (no note:saved / re-index), so patch the one field
  // here rather than refetch — keeps the sidebar tree reactive to drag-into-folder.
  useEffect(() => {
    const handler = ({
      noteId,
      folderId,
      vaultId,
    }: {
      noteId: string
      folderId: string | null
      vaultId?: string | null
    }) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? { ...n, folderId, ...(vaultId !== undefined ? { vaultId } : {}) } : n,
        ),
      )
    }
    eventBus.on('note:moved', handler)
    return () => eventBus.off('note:moved', handler)
  }, [])

  // Reflect a blank note's type conversion (convertNoteKind) in memory.
  useEffect(() => {
    const handler = ({ noteId, kind, content }: { noteId: string; kind: string | null; content: string }) => {
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, kind, content } : n)))
    }
    eventBus.on('note:kind-changed', handler)
    return () => eventBus.off('note:kind-changed', handler)
  }, [])

  // Drive [[wikilink]] syncing from the note:saved event.
  // This is the single place syncLinksForNote is triggered —
  // GraphView and NoteCreator no longer call it directly.
  //
  // Edges only exist between existing notes, so a note that appears under a
  // title (created, or renamed to it) must also re-sync every note that already
  // links to that title — and a rename away from a title must re-sync the notes
  // pointing at the old one so their now-dangling edges drop. `syncedTitles`
  // remembers each note's last-synced title to spot both cases.
  useEffect(() => {
    const handler = (saved: Note) => {
      const all = notesRef.current
      const titleOf = (id: string) => all.find((n) => n.id === id)?.title
      const sync = (n: Note) =>
        syncLinksForNote(n.id, noteLinkText(n, titleOf)).catch((err) => {
          log.error('syncLinksForNote failed', err)
        })
      void sync(saved)

      const previous = syncedTitles.current.get(saved.id)
      syncedTitles.current.set(saved.id, saved.title)
      if (previous === saved.title) return
      const vault = saved.vaultId ?? DEFAULT_VAULT_ID
      const affected = new Map<string, Note>()
      for (const title of [previous, saved.title]) {
        if (!title) continue
        for (const n of notesLinkingTo(title, vault, all, saved.id)) affected.set(n.id, n)
      }
      affected.forEach((n) => void sync(n))
    }
    eventBus.on('note:saved', handler)
    return () => eventBus.off('note:saved', handler)
  }, [])

  const create = useCallback(async (title: string, content: string, id?: string, userTags: string[] = [], kind?: string): Promise<Note> => {
    const note: Note = {
      id: id ?? crypto.randomUUID(),
      title: title.trim() || 'Untitled',
      content,
      tags: userTags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // New notes land in the active vault (unfiled) so they show in its
      // explorer + gallery; folder placement happens after, if any.
      vaultId: getActiveVaultId(),
      // Typed notes (plugin note types) carry their kind; plain notes omit it.
      // Fixed at creation — a later plain save never changes it (Rust-side).
      kind: kind ?? null,
    }

    // Optimistic — show immediately before Rust confirms
    setNotes((prev) => [note, ...prev])

    // Infer auto-tags (new note has no media auto-tags yet, we'll re-infer in another place)
    const autoTags = await inferTags(note)
    const noteWithTags = { ...note, tags: [...autoTags, ...userTags] }
    await saveNote(noteWithTags)

    return noteWithTags
  }, [])

  const update = useCallback(
    async (id: string, title: string, content: string, userTags?: string[]): Promise<Note | undefined> => {
      let updatedNote: Note | undefined

      setNotes((prev) => {
        const existing = prev.find((n) => n.id === id)
        if (!existing) return prev
        const newTags = userTags ? [...existing.tags.filter(isAutoTag), ...userTags] : existing.tags
        updatedNote = {
          ...existing,
          title: title.trim(),
          content,
          tags: newTags,
          updatedAt: Date.now(),
        }
        return prev.map((n) => (n.id === id ? updatedNote! : n))
      })

      if (updatedNote) {
        // Re-infer auto-tags but preserve existing user tags
        const userTags = updatedNote.tags.filter((t) => !isAutoTag(t))
        const autoTags = await inferTags(updatedNote)
        updatedNote = { ...updatedNote, tags: [...autoTags, ...userTags] }
        await saveNote(updatedNote)
        return updatedNote
      }
    },
    []
  )

  const remove = useCallback(async (id: string, opts?: { confirm?: boolean }): Promise<boolean> => {
    const needConfirm = (opts?.confirm ?? true) && getGeneralSettings().confirmBeforeDelete
    if (needConfirm) {
      const ok = await showConfirmDialog({
        title: 'Delete note?',
        message: 'The note moves to Trash — you can restore it from there.',
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return false
    }
    // Optimistic — remove immediately
    setNotes((prev) => prev.filter((n) => n.id !== id))
    await trashNote(id)
    // trashNote already emits 'note:deleted' in core/notes.ts —
    // we don't emit again here to avoid double-fire.
    return true
  }, [])

  /** Update just the user-tag portion without re-running inferTags */
  const updateTags = useCallback(async (id: string, userTags: string[]) => {
    let saved: Note | undefined
    setNotes((prev) => {
      const existing = prev.find((n) => n.id === id)
      if (!existing) return prev
      const autoTags = existing.tags.filter(isAutoTag)
      saved = { ...existing, tags: [...autoTags, ...userTags], updatedAt: Date.now() }
      return prev.map((n) => (n.id === id ? saved! : n))
    })
    if (saved) await saveNote(saved)
  }, [])

  // Memoized so NotesContext's value only changes identity when one of these
  // fields actually does — `create`/`update`/`remove`/`updateTags` are already
  // stable (empty-dep useCallback above), so this mainly guards against a
  // fresh object on renders where only `loading`/`error` would otherwise force
  // every useNotesContext() consumer to re-render for no reason. `notes` itself
  // still changes (by design) whenever a note is actually created/updated/removed.
  return useMemo(
    () => ({ notes, loading, error, create, update, updateTags, remove }),
    [notes, loading, error, create, update, updateTags, remove],
  )
}
