// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect } from 'react'
import { eventBus } from '../lib/eventBus'
import { listPdfAnnotationText } from '../core/annotations'
import { saveAttachmentText } from '../core/attachmentText'
import { getNote } from '../core/notes'
import { log } from '../lib/logger'

// Reserved pseudo-filename so annotation text is its own attachment_text row,
// concatenated alongside real PDF body text by fetch_attachment_text_for_note.
const ANNOTATION_KEY = '<annotations>'

/**
 * Folds a note's textual PDF annotations (typed boxes + highlight notes) into
 * the shared `attachment_text` store on any annotation change, then re-emits
 * `note:saved` so the keyword (useSearch) and RAG (useRag) indexes re-ingest —
 * exactly like usePdfTextIndex does for extracted PDF body text. Mounted once
 * (AppLayout). Only listens to annotation:* (never note:saved), so its own
 * re-emit can't loop.
 *
 * Re-emits the *full* note (re-fetched via `getNote`), not a bare `{ id }` —
 * useSearch's `note:saved` handler replaces the whole indexed document from
 * the payload (a bare id would blank the title/content fields it indexes),
 * and useRag's chunker reads `note.content` directly (a bare id throws inside
 * the chunker, silently failing indexing). If the fetch fails, the re-emit is
 * skipped entirely (logged) rather than emitted as a partial note — the
 * annotation text is already persisted via `saveAttachmentText`, and a later
 * real `note:saved` will pick it up.
 */
export function usePdfAnnotationIndex(): void {
  useEffect(() => {
    const handler = (payload: unknown) => {
      const noteId = (payload as { noteId?: string })?.noteId
      if (!noteId) return
      void (async () => {
        try {
          const text = await listPdfAnnotationText(noteId)
          await saveAttachmentText(noteId, ANNOTATION_KEY, text)
          const note = await getNote(noteId).catch((e) => {
            log.error('usePdfAnnotationIndex: getNote failed, skipping re-emit', e)
            return null
          })
          if (note) eventBus.emit('note:saved', note)
        } catch (e) {
          log.error('usePdfAnnotationIndex: failed', e)
        }
      })()
    }
    eventBus.on('annotation:created', handler)
    eventBus.on('annotation:updated', handler)
    eventBus.on('annotation:deleted', handler)
    return () => {
      eventBus.off('annotation:created', handler)
      eventBus.off('annotation:updated', handler)
      eventBus.off('annotation:deleted', handler)
    }
  }, [])
}
