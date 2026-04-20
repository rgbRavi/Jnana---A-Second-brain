import { useCallback, useMemo } from 'react'
import { makePdfAnnotation } from '../core/annotations'
import { useAnnotations } from './useAnnotations'

export function usePdfAnnotations(noteId: string, mediaId: string, pageNumber: number) {
  const { annotations, create, update, loading } = useAnnotations(noteId)

  const pageAnnotations = useMemo(() => {
    return annotations.filter((annotation) => {
      if (annotation.kind !== 'pdf_highlight') return false
      if (annotation.mediaId !== mediaId) return false

      try {
        const position = JSON.parse(annotation.position)
        return position.page === pageNumber
      } catch {
        return false
      }
    })
  }, [annotations, mediaId, pageNumber])

  const createHighlight = useCallback(
    async (rect: [number, number, number, number]) => {
      const annotation = makePdfAnnotation(noteId, mediaId, pageNumber, rect, '')
      await create(annotation)
      return annotation
    },
    [create, mediaId, noteId, pageNumber],
  )

  return { pageAnnotations, createHighlight, updateAnnotation: update, loading }
}
