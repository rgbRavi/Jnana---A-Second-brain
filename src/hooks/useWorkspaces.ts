import { useCallback, useEffect, useState } from 'react'
import { listWorkspaces } from '../core/workspaces'
import { eventBus } from '../lib/eventBus'
import { log } from '../lib/logger'
import type { Workspace } from '../types'

/** Loads the workspace list, refreshing on any `workspace:changed` event. */
export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setWorkspaces(await listWorkspaces())
    } catch (e) {
      log.error('Failed to load workspaces', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    eventBus.on('workspace:changed', refresh)
    return () => eventBus.off('workspace:changed', refresh)
  }, [refresh])

  return { workspaces, loading, refresh }
}
