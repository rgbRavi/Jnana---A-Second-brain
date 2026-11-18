// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

/** Shortest chain of notes from `from` to `to` over an undirected adjacency map
 *  (BFS), ends inclusive. `null` when unreachable; `[from]` when they're the same. */
export function shortestPath(adjacency: Map<string, Set<string>>, from: string, to: string): string[] | null {
  if (from === to) return [from]
  const prev = new Map<string, string>([[from, from]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    for (const next of adjacency.get(queue[i]) ?? []) {
      if (prev.has(next)) continue
      prev.set(next, queue[i])
      if (next === to) {
        const path = [to]
        while (path[0] !== from) path.unshift(prev.get(path[0])!)
        return path
      }
      queue.push(next)
    }
  }
  return null
}
