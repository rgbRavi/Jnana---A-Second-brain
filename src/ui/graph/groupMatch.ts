// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Graph group model + matcher. Pure (no React) so it is tested in isolation.
// A group has at most one tags line and one title line, each holding several
// values; `match` says whether a note needs both lines ('all') or either ('any').

export type TitleOp = 'contains' | 'starts' | 'ends' | 'exact' | 'regex'
export interface GraphGroup {
  id: string
  color: string
  match: 'all' | 'any'
  tags: string[]
  tagMode: 'any' | 'all'
  titleOp: TitleOp
  /** A note's title matches when it matches ANY of these. */
  titles: string[]
}

const OPS: TitleOp[] = ['contains', 'starts', 'ends', 'exact', 'regex']
const OP_WORDS: Record<TitleOp, string> = {
  contains: 'contains',
  starts: 'starts with',
  ends: 'ends with',
  exact: 'is',
  regex: 'matches',
}

export function newGroup(color: string): GraphGroup {
  return { id: crypto.randomUUID(), color, match: 'all', tags: [], tagMode: 'any', titleOp: 'contains', titles: [] }
}

export function isValidRegex(src: string): boolean {
  try {
    new RegExp(src, 'i')
    return true
  } catch {
    return false
  }
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const uniqCI = (xs: string[]) => {
  const seen = new Set<string>()
  return xs.filter((x) => {
    const k = x.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Load persisted groups: legacy `{query}`, the short-lived `{conditions}` list,
 *  the current flat shape, or junk (dropped). */
export function migrateGroups(raw: unknown): GraphGroup[] {
  if (!Array.isArray(raw)) return []
  const out: GraphGroup[] = []
  for (const g of raw as any[]) {
    if (!g || typeof g !== 'object' || typeof g.id !== 'string' || typeof g.color !== 'string') continue
    const base: GraphGroup = { ...newGroup(g.color), id: g.id, match: g.match === 'any' ? 'any' : 'all' }
    if (Array.isArray(g.tags) || Array.isArray(g.titles)) {
      out.push({
        ...base,
        tags: strs(g.tags),
        tagMode: g.tagMode === 'all' ? 'all' : 'any',
        titleOp: OPS.includes(g.titleOp) ? g.titleOp : 'contains',
        titles: strs(g.titles),
      })
    } else if (Array.isArray(g.conditions)) {
      // Merge every tags condition into one line and every title condition into
      // another (first condition's mode / op wins).
      const tagCs = g.conditions.filter((c: any) => c?.kind === 'tags' && Array.isArray(c.tags))
      const titleCs = g.conditions.filter((c: any) => c?.kind === 'title' && typeof c.value === 'string')
      out.push({
        ...base,
        tags: uniqCI(tagCs.flatMap((c: any) => strs(c.tags))),
        tagMode: tagCs[0]?.mode === 'all' ? 'all' : 'any',
        titleOp: OPS.includes(titleCs[0]?.op) ? titleCs[0].op : 'contains',
        titles: titleCs.map((c: any) => c.value.trim()).filter(Boolean),
      })
    } else if (typeof g.query === 'string') {
      const q = g.query.trim()
      const m = /^(?:#|tag:)\s*(.*)$/i.exec(q)
      if (m) out.push({ ...base, tags: m[1].trim() ? [m[1].trim()] : [] })
      else out.push({ ...base, titles: q ? [q] : [] })
    }
  }
  return out
}

type Note = { title?: string; tags?: string[] }

/** Compile once per group change; returns a per-note predicate. */
export function compileGroup(g: GraphGroup): (note: Note) => boolean {
  const tests: ((n: Note) => boolean)[] = []

  const want = g.tags.map((t) => t.toLowerCase())
  if (want.length) {
    tests.push((n) => {
      const have = new Set((n.tags ?? []).map((t) => t.toLowerCase()))
      return g.tagMode === 'all' ? want.every((t) => have.has(t)) : want.some((t) => have.has(t))
    })
  }

  const vals = g.titles.map((v) => v.trim()).filter(Boolean)
  let titleTests: ((title: string) => boolean)[] = []
  if (g.titleOp === 'regex') {
    for (const v of vals) {
      try {
        const re = new RegExp(v, 'i')
        titleTests.push((t) => re.test(t))
      } catch {
        /* invalid pattern: skipped, so a typo doesn't blank the group */
      }
    }
  } else {
    titleTests = vals.map((raw) => {
      const v = raw.toLowerCase()
      switch (g.titleOp) {
        case 'starts': return (t: string) => t.toLowerCase().startsWith(v)
        case 'ends': return (t: string) => t.toLowerCase().endsWith(v)
        case 'exact': return (t: string) => t.toLowerCase() === v
        default: return (t: string) => t.toLowerCase().includes(v)
      }
    })
  }
  if (titleTests.length) tests.push((n) => titleTests.some((f) => f(n.title ?? '')))

  if (!tests.length) return () => false
  return g.match === 'any' ? (n) => tests.some((t) => t(n)) : (n) => tests.every((t) => t(n))
}

/** Plain-language one-liner, e.g. "#cv or #ml · title starts with Lab, Intro"; '' when empty. */
export function describeGroup(g: GraphGroup): string {
  const parts: string[] = []
  if (g.tags.length) parts.push(g.tags.map((t) => `#${t}`).join(g.tagMode === 'all' ? ' and ' : ' or '))
  const vals = g.titles.map((v) => v.trim()).filter(Boolean)
  if (vals.length) parts.push(`title ${OP_WORDS[g.titleOp]} ${vals.join(', ')}`)
  return parts.join(g.match === 'any' ? ' or ' : ' · ')
}
