// src/hooks/useNotes.ts
import { useState, useEffect, useCallback } from 'react'
import { Note } from '../types/index'
import { getAllNotes, saveNote, deleteNote, syncLinksForNote } from '../core/notes'
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

  // Stay in sync when any note is saved (optimistic update already applied,
  // but this handles saves from other parts of the app too)
  useEffect(() => {
    const handler = (saved: Note) => {
      setNotes((prev) => {
        const exists = prev.find((n) => n.id === saved.id)
        if (exists) {
          return prev.map((n) => (n.id === saved.id ? saved : n))
        }
        return [saved, ...prev]
      })
    }
    eventBus.on('note:saved', handler)
    return () => eventBus.off('note:saved', handler)
  }, [])

  const create = useCallback(
    async (title: string, content: string): Promise<Note> => {
      const note: Note = {
        id: crypto.randomUUID(),
        title: title.trim() || 'Untitled',
        content,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      // Optimistic — add to list immediately, before Rust confirms
      setNotes((prev) => [note, ...prev])

      // Persist in background — core will emit 'note:saved'
      await saveNote(note)
      await syncLinksForNote(note.id, content)

      return note
    },
    []
  )

  const update = useCallback(
    async (id: string, title: string, content: string): Promise<Note | undefined> => {
      let updatedNote: Note | undefined

      setNotes((prev) => {
        const temp = prev.find((n) => n.id === id)
        if (!temp) return prev
        updatedNote = {
          ...temp,
          title: title.trim(),
          content,
          updatedAt: Date.now(),
        }
        return prev.map((n) => (n.id === id ? updatedNote! : n))
      })

      if (updatedNote) {
        await saveNote(updatedNote)
        await syncLinksForNote(id, content)
        return updatedNote
      }
    },
    []
  )

  const remove = useCallback(async (id: string) => {
    // Optimistic — remove from list immediately
    setNotes((prev) => prev.filter((n) => n.id !== id))
    await deleteNote(id)
    eventBus.emit('note:deleted', id)
  }, [])

  return { notes, loading, create, update, remove }
}