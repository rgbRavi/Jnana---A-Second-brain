// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useMemo } from 'react'
import { makePdfAnnotation, makePdfInkAnnotation, makePdfTextAnnotation } from '../core/annotations'
import { useAnnotations } from './useAnnotations'

// Parsed, page-scoped views of the three PDF annotation kinds. All coordinates
// are in PDF point space (bottom-left origin) — the caller converts to/from
// viewport pixels with the pdf.js PageViewport so marks survive zoom.
export interface PdfHighlight {
  id: string
  rect: [number, number, number, number]
  content: string
}
export interface PdfInk {
  id: string
  points: [number, number, number][]
  color: string
  size: number
}
export interface PdfText {
  id: string
  x: number
  y: number
  fontSize: number
  text: string
  /** Explicit text colour; undefined → viewer auto-contrasts the page bg. */
  color?: string
}

interface PdfPosition {
  page?: number
  rect?: [number, number, number, number]
  points?: [number, number, number][]
  color?: string
  size?: number
  x?: number
  y?: number
  fontSize?: number
}

export function usePdfAnnotations(noteId: string, mediaId: string, pageNumber: number) {
  const { annotations, create, update, updatePosition, remove, loading } = useAnnotations(noteId)

  const { highlights, inks, texts } = useMemo(() => {
    const highlights: PdfHighlight[] = []
    const inks: PdfInk[] = []
    const texts: PdfText[] = []
    for (const a of annotations) {
      if (a.mediaId !== mediaId) continue
      let pos: PdfPosition
      try {
        pos = JSON.parse(a.position) as PdfPosition
      } catch {
        continue
      }
      if (pos.page !== pageNumber) continue
      if (a.kind === 'pdf_highlight' && pos.rect) {
        highlights.push({ id: a.id, rect: pos.rect, content: a.content })
      } else if (a.kind === 'pdf_ink' && pos.points) {
        inks.push({ id: a.id, points: pos.points, color: pos.color ?? '#7c6af7', size: pos.size ?? 4 })
      } else if (a.kind === 'pdf_text' && pos.x != null && pos.y != null) {
        texts.push({ id: a.id, x: pos.x, y: pos.y, fontSize: pos.fontSize ?? 14, text: a.content, color: pos.color })
      }
    }
    return { highlights, inks, texts }
  }, [annotations, mediaId, pageNumber])

  const createHighlight = useCallback(
    async (rect: [number, number, number, number]) => {
      const annotation = makePdfAnnotation(noteId, mediaId, pageNumber, rect, '')
      await create(annotation)
      return annotation
    },
    [create, mediaId, noteId, pageNumber],
  )

  const createInk = useCallback(
    async (points: [number, number, number][], color: string, size: number) => {
      const annotation = makePdfInkAnnotation(noteId, mediaId, pageNumber, points, color, size)
      await create(annotation)
      return annotation
    },
    [create, mediaId, noteId, pageNumber],
  )

  const createText = useCallback(
    async (x: number, y: number, text: string, fontSize: number, color?: string) => {
      const annotation = makePdfTextAnnotation(noteId, mediaId, pageNumber, x, y, text, fontSize, color)
      await create(annotation)
      return annotation
    },
    [create, mediaId, noteId, pageNumber],
  )

  // Rewrite a text box's position JSON — used for drag-to-move and colour
  // changes, keeping page + the other fields intact. `color` undefined drops the
  // key, reverting the box to auto-contrast.
  const writeText = useCallback(
    async (id: string, x: number, y: number, fontSize: number, color?: string) => {
      await updatePosition(id, JSON.stringify({ page: pageNumber, x, y, fontSize, ...(color ? { color } : {}) }))
    },
    [updatePosition, pageNumber],
  )

  return {
    highlights,
    inks,
    texts,
    createHighlight,
    createInk,
    createText,
    updateText: update,
    writeText,
    remove,
    loading,
  }
}
