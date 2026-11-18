// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

/** Ids within `hops` links of `start` (BFS over an undirected adjacency map); includes `start`. */
export function nodesWithinHops(adjacency: Map<string, Set<string>>, start: string, hops: number): Set<string> {
  const seen = new Set<string>([start])
  let frontier = [start]
  for (let d = 0; d < hops && frontier.length; d++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const n of adjacency.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          next.push(n)
        }
      }
    }
    frontier = next
  }
  return seen
}
