// src/hooks/useProjects.ts
import { useCallback, useEffect, useState } from 'react'
import { listProjects } from '../core/aiWorkspace'
import type { AiProject } from '../types'

/** Loads the AI projects list (refreshable after edits). */
export function useProjects() {
  const [projects, setProjects] = useState<AiProject[]>([])

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects())
    } catch (e) {
      console.error('Failed to load projects:', e)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { projects, refresh }
}
