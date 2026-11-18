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

export type Step =
  | { kind: 'note'; id: string; at: number }
  | { kind: 'link'; source: string; target: string; at: number }

export const linkKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Delay between playback steps at a speed multiplier. */
export const stepDelayMs = (speed: number): number => 500 / speed

/** One step per note (oldest first), each followed by the links it completes. A link to a
 *  missing-note pseudo-node completes with the referencing note (the link step reveals the pseudo). */
export function buildTimelineSteps(nodes: TNode[], links: TLink[]): Step[] {
  const real = nodes
    .filter((n) => !n.isPseudo && n.id)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.id! < b.id! ? -1 : 1))
  const order = new Map(real.map((n, i) => [n.id!, i]))
  const pseudo = new Set(nodes.filter((n) => n.isPseudo && n.id).map((n) => n.id!))
  const byNote = new Map<string, [string, string][]>()
  for (const l of links) {
    const a = idOf(l.source)
    const b = idOf(l.target)
    if (a === b) continue
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const ix = order.get(x)
      if (ix === undefined) continue
      const iy = order.get(y)
      if ((iy !== undefined && iy < ix) || pseudo.has(y)) byNote.set(x, [...(byNote.get(x) ?? []), [a, b]])
    }
  }
  const steps: Step[] = []
  const seen = new Set<string>()
  for (const n of real) {
    const at = n.createdAt ?? 0
    steps.push({ kind: 'note', id: n.id!, at })
    for (const [source, target] of byNote.get(n.id!) ?? []) {
      const k = linkKey(source, target)
      if (seen.has(k)) continue
      seen.add(k)
      steps.push({ kind: 'link', source, target, at })
    }
  }
  return steps
}

/** What is revealed after the first `k` steps. */
export function visibleAtStep(steps: Step[], k: number): { nodes: Set<string>; links: Set<string> } {
  const nodes = new Set<string>()
  const links = new Set<string>()
  for (const s of steps.slice(0, k)) {
    if (s.kind === 'note') nodes.add(s.id)
    else {
      nodes.add(s.source).add(s.target)
      links.add(linkKey(s.source, s.target))
    }
  }
  return { nodes, links }
}
