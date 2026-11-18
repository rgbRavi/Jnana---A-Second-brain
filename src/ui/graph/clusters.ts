// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Auto-detected note clusters: deterministic label propagation over the link graph.

const MAX_ITERATIONS = 20

/** id -> cluster index (0..k-1), biggest cluster first, ties by smallest member id. */
export function detectClusters(ids: string[], adjacency: Map<string, Set<string>>): Map<string, number> {
  const sorted = [...ids].sort()
  const label = new Map(sorted.map((id, i) => [id, i]))
  for (let it = 0; it < MAX_ITERATIONS; it++) {
    let changed = false
    for (const id of sorted) {
      const counts = new Map<number, number>()
      const mine = adjacency.get(id)
      for (const n of mine ?? []) {
        const l = label.get(n)
        if (l === undefined) continue
        // A vote counts more per neighbour both of us link to, so a lone bridge
        // edge can't drag a node out of the dense group it belongs to.
        let w = 1
        for (const m of adjacency.get(n) ?? []) if (mine!.has(m)) w++
        counts.set(l, (counts.get(l) ?? 0) + w)
      }
      let best = label.get(id)!
      let bestN = 0
      for (const [l, c] of counts) if (c > bestN || (c === bestN && l < best)) { best = l; bestN = c }
      if (bestN > 0 && best !== label.get(id)) { label.set(id, best); changed = true }
    }
    if (!changed) break
  }
  const groups = new Map<number, string[]>()
  for (const id of sorted) {
    const l = label.get(id)!
    const g = groups.get(l)
    if (g) g.push(id)
    else groups.set(l, [id])
  }
  // members are already in sorted order, so m[0] is the smallest id
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1))
  const out = new Map<string, number>()
  ordered.forEach((members, i) => members.forEach((id) => out.set(id, i)))
  return out
}

/** Palette colours for the largest clusters, in order; small clusters and overflow stay uncoloured. */
export function clusterColours(clusters: Map<string, number>, palette: string[], minSize = 3): Map<string, string> {
  const sizes = new Map<number, number>()
  for (const c of clusters.values()) sizes.set(c, (sizes.get(c) ?? 0) + 1)
  const out = new Map<string, string>()
  for (const [id, c] of clusters) {
    // indices are size-ordered, so palette index === cluster index
    if ((sizes.get(c) ?? 0) >= minSize && c < palette.length) out.set(id, palette[c])
  }
  return out
}
