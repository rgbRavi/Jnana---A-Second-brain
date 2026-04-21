// src/hooks/useNotes.ts
import { useState, useEffect, useCallback } from 'react'
import { Note } from '../types/index'
import { getAllNotes, saveNote, deleteNote, syncLinksForNote } from '../core/notes'
import { inferTags, isAutoTag } from '../core/tags'
import { eventBus } from '../lib/eventBus'

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  // Load all notes on mount
  useEffect(() => {
    getAllNotes().then((fetched) => {
      setNotes(fetched)
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

  // Drive [[wikilink]] syncing from the note:saved event.
  // This is the single place syncLinksForNote is triggered —
  // GraphView and NoteCreator no longer call it directly.
  useEffect(() => {
    const handler = (saved: Note) => {
      syncLinksForNote(saved.id, saved.content).catch((err) => {
        console.error('syncLinksForNote failed:', err)
      })
    }
    eventBus.on('note:saved', handler)
    return () => eventBus.off('note:saved', handler)
  }, [])

  const create = useCallback(async (title: string, content: string, id?: string, userTags: string[] = []): Promise<Note> => {
    const note: Note = {
      id: id ?? crypto.randomUUID(),
      title: title.trim() || 'Untitled',
      content,
      tags: userTags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
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

  const remove = useCallback(async (id: string) => {
    // Optimistic — remove immediately
    setNotes((prev) => prev.filter((n) => n.id !== id))
    await deleteNote(id)
    // deleteNote already emits 'note:deleted' in core/notes.ts —
    // we don't emit again here to avoid double-fire.
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

  return { notes, loading, create, update, updateTags, remove }
}
