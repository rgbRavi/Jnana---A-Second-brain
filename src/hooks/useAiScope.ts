// AI / search scope: whether retrieval ranges over the entire vault or a single
// workspace. Persisted module store (localStorage + useSyncExternalStore), same
// pattern as useActiveWorkspace. Consumed by the AI view (sets the RAG retrieval
// scope) and the Search view (filters its note set).

import { useSyncExternalStore } from 'react'

export type ScopeMode = 'vault' | 'workspace'

export interface AiScope {
  mode: ScopeMode
  workspaceId: string | null
}

const STORAGE_KEY = 'jnana.ai.scope'
const DEFAULTS: AiScope = { mode: 'vault', workspaceId: null }

function load(): AiScope {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AiScope>) }
  } catch {
    return DEFAULTS
  }
}

let state: AiScope = load()
const listeners = new Set<() => void>()

function commit(next: AiScope) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

export function setScopeMode(mode: ScopeMode): void {
  if (mode === state.mode) return
  commit({ ...state, mode })
}

export function setScopeWorkspace(workspaceId: string | null): void {
  if (workspaceId === state.workspaceId) return
  commit({ ...state, workspaceId })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => state

export function useAiScope(): AiScope {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
