import { useCallback, useEffect, useRef, useState } from 'react'
import { log } from '../lib/logger'
import {
  EMPTY_DOC,
  getCanvas,
  parseDoc,
  saveCanvas,
  serializeDoc,
  type Canvas,
  type CanvasDoc,
} from '../core/canvas'

type DocUpdater = CanvasDoc | ((prev: CanvasDoc) => CanvasDoc)

/**
 * Loads one canvas (by id) and owns its document, autosaving (debounced) on every
 * mutation and flushing pending saves when the canvas changes or unmounts. The
 * canvas's title is owned by rename (save_canvas only persists `data`), so a
 * stale in-memory title never clobbers a rename. `setDoc` is a useState drop-in.
 */
export function useCanvas(canvasId: string | null) {
  const [doc, setDocState] = useState<CanvasDoc>(EMPTY_DOC)
  const [loading, setLoading] = useState(true)

  const metaRef = useRef<{ id: string; workspaceId: string; title: string; createdAt: number } | null>(null)
  const pendingRef = useRef<Canvas | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    const payload = pendingRef.current
    if (!payload) return
    pendingRef.current = null
    saveCanvas(payload).catch((e) => log.error('Failed to save canvas', e))
  }, [])

  const scheduleSave = useCallback(
    (nextDoc: CanvasDoc) => {
      const meta = metaRef.current
      if (!meta) return
      pendingRef.current = {
        id: meta.id,
        workspaceId: meta.workspaceId,
        title: meta.title,
        data: serializeDoc(nextDoc),
        createdAt: meta.createdAt,
        updatedAt: Date.now(),
      }
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(flush, 600)
    },
    [flush],
  )

  useEffect(() => {
    if (!canvasId) {
      metaRef.current = null
      setDocState(EMPTY_DOC)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    metaRef.current = null
    getCanvas(canvasId)
      .then((c) => {
        if (!active || !c) return
        metaRef.current = { id: c.id, workspaceId: c.workspaceId, title: c.title, createdAt: c.createdAt }
        setDocState(parseDoc(c.data))
      })
      .catch((e) => log.error('Failed to load canvas', e))
      .finally(() => { if (active) setLoading(false) })
    return () => {
      active = false
      flush() // persist the last edit before switching canvases / unmounting
    }
  }, [canvasId, flush])

  const setDoc = useCallback(
    (updater: DocUpdater) => {
      setDocState((prev) => {
        const next = typeof updater === 'function' ? (updater as (p: CanvasDoc) => CanvasDoc)(prev) : updater
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  return { doc, setDoc, loading }
}
