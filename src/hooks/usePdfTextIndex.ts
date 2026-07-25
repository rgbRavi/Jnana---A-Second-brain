// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect } from 'react'
import type { Note } from '../types'
import { eventBus } from '../lib/eventBus'
import { extractPdfText } from '../core/media/pdfText'
import { saveAttachmentText } from '../core/attachmentText'
import { log } from '../lib/logger'

const PDF_EMBED = /!\[pdf\]\(jnana-asset:\/\/([^)]+)\)/g

/**
 * Filenames of the `![pdf](jnana-asset://…)` embeds in a note's markdown.
 * Pure — exported for testing.
 */
export function pdfEmbedFilenames(content: string): string[] {
  return [...content.matchAll(PDF_EMBED)].map((m) => m[1])
}

// Per-session guard, keyed `${noteId}::${filename}`: a note:saved storm (autosave)
// won't re-parse a PDF we've handled, and — crucially — our own re-emit below
// terminates instead of looping, because the second pass finds every key present.
const processed = new Set<string>()

/**
 * Extracts text from a note's PDF attachments (pdf.js) *after* the note is saved
 * — so the `notes` row exists and persisting to `attachment_text` can't hit its
 * foreign key — then re-emits `note:saved` so the keyword (`useSearch`) and RAG
 * (`useRag`) indexes re-ingest the newly-available text via their existing
 * note:saved handlers. Mounted once (AppLayout). Best-effort: a scanned/broken
 * PDF yields no text and never blocks or breaks anything.
 */
export function usePdfTextIndex() {
  useEffect(() => {
    const handler = (note: Note) => {
      void (async () => {
        const filenames = pdfEmbedFilenames(note.content ?? '')
        let savedAny = false
        for (const filename of filenames) {
          const key = `${note.id}::${filename}`
          if (processed.has(key)) continue
          processed.add(key)
          try {
            const text = (await extractPdfText(filename)).trim()
            if (text) {
              await saveAttachmentText(note.id, filename, text)
              savedAny = true
            }
          } catch (e) {
            processed.delete(key) // allow a retry on a later save
            log.error('usePdfTextIndex: extract/save failed', e)
          }
        }
        // Re-notify so useSearch/useRag re-pull getAttachmentText and re-index.
        // The `processed` guard makes this second pass a no-op (no further emit).
        if (savedAny) eventBus.emit('note:saved', note)
      })()
    }
    eventBus.on('note:saved', handler)
    return () => eventBus.off('note:saved', handler)
  }, [])
}
