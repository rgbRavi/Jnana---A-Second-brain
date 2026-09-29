// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A one-shot request from elsewhere in the app for the graph to highlight
// something: "show me the orphans", "show me the links you'd suggest". The
// dashboard's insight tiles set it and navigate; GraphView reads it on mount and
// paints accordingly until dismissed.
//
// Module store rather than a route param because it's transient UI state, not
// something worth putting in the URL or persisting — the same bridge pattern the
// right rail uses (lib/activeTable, lib/activeNote).

import { useSyncExternalStore } from 'react'

export type SpotlightKind = 'orphans' | 'suggested'

let spotlight: SpotlightKind | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => spotlight

/** Ask the graph to highlight something the next time it renders. */
export function setGraphSpotlight(kind: SpotlightKind | null): void {
  if (spotlight === kind) return
  spotlight = kind
  listeners.forEach((l) => l())
}

export function useGraphSpotlight(): SpotlightKind | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
