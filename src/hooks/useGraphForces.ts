// Persistent graph force settings (center / repel / link / distance). Module-level
// store backed by localStorage + useSyncExternalStore — same pattern as
// useComposerOptions / useSidebarPrefs — so a user's tuned forces survive an app
// restart instead of resetting to defaults every session.

import { useSyncExternalStore } from 'react'

export interface GraphForces {
  center: number
  repel: number
  link: number
  distance: number
}

export const DEFAULT_GRAPH_FORCES: GraphForces = { center: 0.4, repel: 120, link: 0.5, distance: 60 }

const STORAGE_KEY = 'jnana.graph.forces'

function load(): GraphForces {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_GRAPH_FORCES
    return { ...DEFAULT_GRAPH_FORCES, ...(JSON.parse(raw) as Partial<GraphForces>) }
  } catch {
    return DEFAULT_GRAPH_FORCES
  }
}

let forces: GraphForces = load()
const listeners = new Set<() => void>()

export function setGraphForces(patch: Partial<GraphForces>): void {
  forces = { ...forces, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forces))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => forces

export function useGraphForces(): GraphForces {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
