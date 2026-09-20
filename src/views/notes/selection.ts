// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Selection maths for the notes grid. Pure so the ordering rules stay testable:
// a Shift-range runs over the notes *as displayed*, so it follows the active
// sort and filters rather than any underlying order.

/** Toggle one id in or out of a selection. */
export function toggleSelected(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * The ids between `anchor` and `target` inclusive, in display order. Direction
 * doesn't matter — dragging a range upward selects the same notes as downward.
 * An anchor that's no longer displayed (filtered away since the last click)
 * leaves just the target selected.
 */
export function rangeBetween(ids: string[], anchor: string | null, target: string): string[] {
  const to = ids.indexOf(target)
  if (to === -1) return []
  const from = anchor === null ? -1 : ids.indexOf(anchor)
  if (from === -1) return [target]
  return from <= to ? ids.slice(from, to + 1) : ids.slice(to, from + 1)
}

/** Add a Shift-range to what's already selected (ranges extend, never replace). */
export function selectRange(
  selected: Set<string>,
  ids: string[],
  anchor: string | null,
  target: string,
): Set<string> {
  return new Set([...selected, ...rangeBetween(ids, anchor, target)])
}
