// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/hooks/useSearch.ts
import { useEffect, useRef, useState, useCallback } from 'react'
import MiniSearch, { type SearchResult } from 'minisearch'
import type { Note } from '../types'
import { eventBus } from '../lib/eventBus'
import { useViewState } from './useViewState'
import {
  createNoteIndex,
  updateIndexedNote,
  removeIndexedNote,
  searchNotes,
} from '../core/search'
import { getAllAttachmentText, getAttachmentText } from '../core/attachmentText'

type IndexedNote = {
  id: string
  title: string
  content: string
  tags: string
  updatedAt: number
}

export function useSearch(notes: Note[], persistKey = 'search:query') {
  const indexRef = useRef<MiniSearch<IndexedNote> | null>(null)
  // Query persists across view switches; results are recomputed from it when the
  // index (re)builds on remount, so they don't need separate persistence.
  const [query, setQuery] = useViewState(persistKey, '')
  const [results, setResults] = useState<SearchResult[]>([])
  const [ready, setReady] = useState(false)

  // The build effect reads the query through a ref so typing a query never
  // triggers a full index rebuild — only `notes` changes do.
  const queryRef = useRef(query)
  queryRef.current = query

  const runSearch = useCallback((nextQuery: string) => {
    const index = indexRef.current
    if (!index || !nextQuery.trim()) {
      setResults([])
      return
    }

    setResults(searchNotes(nextQuery, index))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function buildIndex() {
      setReady(false)
      // Best-effort: keyword search still builds if attachment text can't load.
      let attach: Map<string, string> | undefined
      try {
        attach = await getAllAttachmentText()
      } catch {
        attach = undefined
      }
      const index = await createNoteIndex(notes, attach)
      if (cancelled) return

      indexRef.current = index
      setReady(true)

      const current = queryRef.current
      if (current.trim()) {
        setResults(searchNotes(current, index))
      } else {
        setResults([])
      }
    }

    void buildIndex()

    return () => {
      cancelled = true
    }
  }, [notes])

  useEffect(() => {
    const handleSaved = (note: Note) => {
      const index = indexRef.current
      if (!index) return

      // Pull this note's attachment text so a re-saved note keeps PDF content
      // searchable; best-effort, don't block the index update on it.
      void getAttachmentText(note.id)
        .catch(() => '')
        .then((extra) => {
          updateIndexedNote(index, note, extra)
          if (query.trim()) setResults(searchNotes(query, index))
        })
    }

    const handleDeleted = ({ id }: { id: string }) => {
      const index = indexRef.current
      if (!index) return    

      removeIndexedNote(index, id)

      if (query.trim()) {
        setResults(searchNotes(query, index))
      } else {
        setResults([])
      }
    }

    eventBus.on('note:saved', handleSaved)
    eventBus.on('note:deleted', handleDeleted)

    return () => {
      eventBus.off('note:saved', handleSaved)
      eventBus.off('note:deleted', handleDeleted)
    }
  }, [query])

  const search = useCallback((nextQuery: string) => {
    setQuery(nextQuery)
    runSearch(nextQuery)
  }, [runSearch])

  const clearSearch = useCallback(() => {
    setQuery('')
    setResults([])
  }, [])

  return {
    query,
    results,
    ready,
    search,
    clearSearch,
  }
}
