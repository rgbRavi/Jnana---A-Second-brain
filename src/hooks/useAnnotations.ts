// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/hooks/useAnnotations.ts
import { useState, useEffect, useCallback } from 'react'
import type { Annotation } from '../types'
import {
  getAnnotationsForNote,
  getAnnotationsForMedia,
  saveAnnotation,
  updateAnnotation,
  updateAnnotationPosition,
  deleteAnnotation,
} from '../core/annotations'
import { eventBus } from '../lib/eventBus'

/** Merge whichever of content/position an `annotation:updated` event carries —
 *  content edits and position moves emit the same event with different fields. */
type AnnotationPatch = { id: string; content?: string; position?: string }
function applyPatch(list: Annotation[], patch: AnnotationPatch): Annotation[] {
  return list.map((a) => {
    if (a.id !== patch.id) return a
    const next = { ...a }
    if (patch.content !== undefined) next.content = patch.content
    if (patch.position !== undefined) next.position = patch.position
    return next
  })
}

// ─── Per-note hook ────────────────────────────────────────────────────────────
// Use this in note views that need all annotations across every media item.

export function useAnnotations(noteId: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!noteId) return
    setLoading(true)
    getAnnotationsForNote(noteId).then((fetched) => {
      setAnnotations(fetched)
      setLoading(false)
    })
  }, [noteId])

  // Stay in sync with annotations created/updated/deleted anywhere in the app
  useEffect(() => {
    const onCreate = (a: Annotation) => {
      if (a.noteId !== noteId) return
      // Idempotent: the creating component already appended optimistically, so
      // skip if we've seen this id (mirrors the note:saved handling in useNotes).
      setAnnotations((prev) => (prev.some((x) => x.id === a.id) ? prev : [...prev, a]))
    }
    const onUpdate = (patch: AnnotationPatch) => {
      setAnnotations((prev) => applyPatch(prev, patch))
    }
    const onDelete = ({ id }: { id: string }) => {
      setAnnotations((prev) => prev.filter((a) => a.id !== id))
    }

    eventBus.on('annotation:created', onCreate)
    eventBus.on('annotation:updated', onUpdate)
    eventBus.on('annotation:deleted', onDelete)
    return () => {
      eventBus.off('annotation:created', onCreate)
      eventBus.off('annotation:updated', onUpdate)
      eventBus.off('annotation:deleted', onDelete)
    }
  }, [noteId])

  const create = useCallback(async (annotation: Annotation) => {
    // Optimistic
    setAnnotations((prev) => [...prev, annotation])
    await saveAnnotation(annotation)
    return annotation
  }, [])

  const update = useCallback(async (id: string, content: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, content } : a))
    )
    await updateAnnotation(id, content)
  }, [])

  const updatePosition = useCallback(async (id: string, position: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, position } : a))
    )
    await updateAnnotationPosition(id, position)
  }, [])

  const remove = useCallback(async (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
    await deleteAnnotation(id)
  }, [])

  return { annotations, loading, create, update, updatePosition, remove }
}

// ─── Per-media hook ───────────────────────────────────────────────────────────
// Use this in VideoPlayer, PdfViewer, AudioPlayer — scoped to one media item.

export function useMediaAnnotations(mediaId: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!mediaId) return
    setLoading(true)
    getAnnotationsForMedia(mediaId).then((fetched) => {
      setAnnotations(fetched)
      setLoading(false)
    })
  }, [mediaId])

  useEffect(() => {
    const onCreate = (a: Annotation) => {
      if (a.mediaId !== mediaId) return
      // Idempotent: skip if the optimistic create already added this id.
      setAnnotations((prev) => (prev.some((x) => x.id === a.id) ? prev : [...prev, a]))
    }
    const onUpdate = (patch: AnnotationPatch) => {
      setAnnotations((prev) => applyPatch(prev, patch))
    }
    const onDelete = ({ id }: { id: string }) => {
      setAnnotations((prev) => prev.filter((a) => a.id !== id))
    }

    eventBus.on('annotation:created', onCreate)
    eventBus.on('annotation:updated', onUpdate)
    eventBus.on('annotation:deleted', onDelete)
    return () => {
      eventBus.off('annotation:created', onCreate)
      eventBus.off('annotation:updated', onUpdate)
      eventBus.off('annotation:deleted', onDelete)
    }
  }, [mediaId])

  const create = useCallback(async (annotation: Annotation) => {
    setAnnotations((prev) => [...prev, annotation])
    await saveAnnotation(annotation)
    return annotation
  }, [])

  const update = useCallback(async (id: string, content: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, content } : a))
    )
    await updateAnnotation(id, content)
  }, [])

  const remove = useCallback(async (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
    await deleteAnnotation(id)
  }, [])

  return { annotations, loading, create, update, remove }
}