// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

export type Dir = 'up' | 'down' | 'left' | 'right'
type P = { x: number; y: number }

/** Best candidate strictly ahead of `from` in `dir` (y grows down). Off-axis drift is penalised. */
export function pickDirectional(from: P, candidates: (P & { id: string })[], dir: Dir): string | null {
  let best: { id: string; score: number } | null = null
  for (const c of candidates) {
    const dx = c.x - from.x
    const dy = c.y - from.y
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy
    if (!(along > 0)) continue
    const dist = Math.hypot(dx, dy)
    const off = Math.abs(dir === 'left' || dir === 'right' ? dy : dx) / dist // |sin(angle off axis)|
    const score = dist * (1 + 2 * off)
    if (!best || score < best.score || (score === best.score && c.id < best.id)) best = { id: c.id, score }
  }
  return best?.id ?? null
}

/** Where the keyboard cursor lands: the selected node if present, else the highest degree. */
export function startNode(nodes: { id: string; degree: number }[], selectedId: string | null): string | null {
  if (selectedId && nodes.some((n) => n.id === selectedId)) return selectedId
  let best: { id: string; degree: number } | null = null
  for (const n of nodes) if (!best || n.degree > best.degree || (n.degree === best.degree && n.id < best.id)) best = n
  return best?.id ?? null
}
