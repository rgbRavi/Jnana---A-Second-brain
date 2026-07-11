// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect } from 'react'
import { useViewState } from './useViewState'
import { log } from '../lib/logger'
import {
  deleteCanvas,
  getOrCreateWorkspaceCanvas,
  listCanvases,
  newId,
  renameCanvas,
  saveCanvas,
  serializeDoc,
  EMPTY_DOC,
  type Canvas,
} from '../core/canvas'

/**
 * The workspace's canvases (metadata) + the active selection (persisted per
 * workspace across view switches). Ensures at least one canvas exists. The doc
 * itself is loaded/saved by useCanvas keyed on `activeId`.
 */
export function useCanvasList(workspaceId: string) {
  const [canvases, setCanvases] = useViewState<Canvas[]>(`canvas.list:${workspaceId}`, [])
  const [activeId, setActiveId] = useViewState<string | null>(`canvas.active:${workspaceId}`, null)
  const [loading, setLoading] = useViewState<boolean>(`canvas.loading:${workspaceId}`, true)

  const refresh = useCallback(
    () => listCanvases(workspaceId).then((l) => { setCanvases(l); return l }),
    [workspaceId, setCanvases],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      try {
        const def = await getOrCreateWorkspaceCanvas(workspaceId)
        const list = await listCanvases(workspaceId)
        if (!active) return
        setCanvases(list)
        setActiveId((cur) => (cur && list.some((c) => c.id === cur) ? cur : def.id))
      } catch (e) {
        log.error('Failed to load canvases', e)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  const create = useCallback(
    async (name: string) => {
      const now = Date.now()
      const c: Canvas = {
        id: newId(), workspaceId, title: name.trim() || 'Canvas',
        data: serializeDoc(EMPTY_DOC), createdAt: now, updatedAt: now,
      }
      await saveCanvas(c)
      await refresh()
      setActiveId(c.id)
    },
    [workspaceId, refresh, setActiveId],
  )

  const rename = useCallback(
    async (id: string, name: string) => {
      await renameCanvas(id, name.trim() || 'Canvas')
      await refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      await deleteCanvas(id)
      const list = await refresh()
      if (list.length === 0) {
        const def = await getOrCreateWorkspaceCanvas(workspaceId)
        await refresh()
        setActiveId(def.id)
      } else {
        setActiveId((cur) => (cur === id ? list[0].id : cur))
      }
    },
    [workspaceId, refresh, setActiveId],
  )

  return { canvases, activeId, setActiveId, loading, create, rename, remove }
}
