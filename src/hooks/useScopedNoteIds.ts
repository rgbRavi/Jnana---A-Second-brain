import { useEffect, useState } from 'react'
import { eventBus } from '../lib/eventBus'
import { listWorkspaceNotes } from '../core/workspaces'
import { useAiScope, type AiScope } from './useAiScope'

/**
 * Resolves the current AI/search scope to a concrete note-id set: `null` when
 * scoped to the whole vault (or a workspace with no chosen id), otherwise the
 * chosen workspace's membership. Refreshes on membership / deletion changes.
 */
export function useScopedNoteIds(): { scope: AiScope; noteIds: Set<string> | null } {
  const scope = useAiScope()
  const [noteIds, setNoteIds] = useState<Set<string> | null>(null)

  const wsId = scope.mode === 'workspace' ? scope.workspaceId : null

  useEffect(() => {
    if (!wsId) {
      setNoteIds(null)
      return
    }
    let active = true
    const load = () =>
      listWorkspaceNotes(wsId)
        .then((rows) => { if (active) setNoteIds(new Set(rows.map((r) => r.noteId))) })
        .catch(() => { if (active) setNoteIds(new Set()) })
    load()
    eventBus.on('workspace:changed', load)
    eventBus.on('note:deleted', load)
    return () => {
      active = false
      eventBus.off('workspace:changed', load)
      eventBus.off('note:deleted', load)
    }
  }, [wsId])

  return { scope, noteIds: wsId ? noteIds : null }
}
