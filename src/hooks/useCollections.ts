import { useCallback, useEffect, useMemo, useState } from 'react'
import { eventBus } from '../lib/eventBus'
import { log } from '../lib/logger'
import {
  addCollectionNote,
  deleteCollection as deleteCollectionCmd,
  listCollectionNoteIds,
  listCollections,
  newCollection,
  removeCollectionNote,
  saveCollection,
} from '../core/workspaces'
import type { Collection } from '../types'

/**
 * A workspace's collections plus their note-id membership sets. Collections are
 * few per workspace, so we eagerly load every membership for chip counts +
 * filtering. Refreshes on `workspace:changed` (every collection mutation emits
 * it) and on note deletion (a deleted note silently drops its junction rows).
 */
export function useCollections(workspaceId: string) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [members, setMembers] = useState<Map<string, Set<string>>>(new Map())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const cols = await listCollections(workspaceId)
      const entries = await Promise.all(
        cols.map(async (c) => [c.id, new Set(await listCollectionNoteIds(c.id))] as const),
      )
      setCollections(cols)
      setMembers(new Map(entries))
    } catch (e) {
      log.error('Failed to load collections', e)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
    eventBus.on('workspace:changed', refresh)
    eventBus.on('note:deleted', refresh)
    return () => {
      eventBus.off('workspace:changed', refresh)
      eventBus.off('note:deleted', refresh)
    }
  }, [refresh])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const [id, set] of members) m.set(id, set.size)
    return m
  }, [members])

  const create = useCallback(
    async (name: string) => {
      const c = newCollection(workspaceId, name.trim())
      await saveCollection(c)
      return c
    },
    [workspaceId],
  )

  const rename = useCallback(
    (c: Collection, name: string) => saveCollection({ ...c, name: name.trim() }),
    [],
  )

  const remove = useCallback((id: string) => deleteCollectionCmd(id), [])

  const addNote = useCallback(
    (collectionId: string, noteId: string) => addCollectionNote(collectionId, noteId),
    [],
  )
  const removeNote = useCallback(
    (collectionId: string, noteId: string) => removeCollectionNote(collectionId, noteId),
    [],
  )

  return { collections, members, counts, loading, refresh, create, rename, remove, addNote, removeNote }
}
