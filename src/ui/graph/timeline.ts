// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

interface TNode {
  id?: string
  createdAt?: number
  isPseudo?: boolean
}
interface TLink {
  source: any
  target: any
}

/** min..max createdAt of the real notes, or null when there are none. */
export function timeRange(nodes: TNode[]): { min: number; max: number } | null {
  let min = Infinity
  let max = -Infinity
  for (const n of nodes) {
    if (n.isPseudo || typeof n.createdAt !== 'number') continue
    if (n.createdAt < min) min = n.createdAt
    if (n.createdAt > max) max = n.createdAt
  }
  return min <= max ? { min, max } : null
}

export const visibleAt = (createdAt: number, t: number): boolean => createdAt <= t

const idOf = (x: any): string => (typeof x === 'object' && x ? x.id : x)

/** Ids on screen at time `t`: notes created by then, plus missing-note
 *  pseudo-nodes once a visible note links to them. */
export function visibleIds(nodes: TNode[], links: TLink[], t: number): Set<string> {
  const out = new Set<string>()
  for (const n of nodes) if (!n.isPseudo && n.id && visibleAt(n.createdAt ?? 0, t)) out.add(n.id)
  const pseudo = new Set(nodes.filter((n) => n.isPseudo && n.id).map((n) => n.id!))
  for (const l of links) {
    const a = idOf(l.source)
    const b = idOf(l.target)
    if (pseudo.has(b) && out.has(a) && !pseudo.has(a)) out.add(b)
    if (pseudo.has(a) && out.has(b) && !pseudo.has(b)) out.add(a)
  }
  return out
}
