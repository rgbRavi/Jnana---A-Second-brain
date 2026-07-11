// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Working Notes — the editor layout tree (pure, no React / no IO).
//
// A `group` is a stack of tabs (note ids) with one active. A `split` arranges
// children (groups or nested splits) left↔right (`row`) or top↔bottom (`col`)
// with per-child flex `sizes`. The tree supports arbitrary editor groups from
// day one; the UI delivers them in phases. Every operation returns a *new*
// layout — callers persist the result. This file is the heavily-tested core
// (see layout.test.ts), mirroring filterNotes.ts.

export type GroupNode = {
  kind: 'group'
  id: string
  tabs: string[] // note ids, in tab order
  activeTab: string | null
}

export type SplitNode = {
  kind: 'split'
  id: string
  dir: 'row' | 'col'
  sizes: number[] // one per child, fractions summing to ~1
  children: PaneNode[]
}

export type PaneNode = GroupNode | SplitNode

export interface WorkingLayout {
  root: PaneNode | null // null = nothing open (empty state)
  activeGroup: string | null // where new tabs land + keyboard targets
}

export const EMPTY_LAYOUT: WorkingLayout = { root: null, activeGroup: null }

// Monotonic id source. Ids only need to be unique within a session/tree; their
// exact value is never asserted, so a counter (+ restore-safe prefix) is fine.
let idCounter = 0
export function newId(prefix = 'g'): string {
  idCounter += 1
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`
}

// ---- tree walking (read-only) --------------------------------------------

export function allGroups(node: PaneNode | null): GroupNode[] {
  if (!node) return []
  if (node.kind === 'group') return [node]
  return node.children.flatMap(allGroups)
}

export function firstGroup(node: PaneNode | null): GroupNode | null {
  return allGroups(node)[0] ?? null
}

export function findGroup(node: PaneNode | null, id: string): GroupNode | null {
  return allGroups(node).find((g) => g.id === id) ?? null
}

/** The group currently holding `noteId` as one of its tabs, if any. */
export function groupOf(node: PaneNode | null, noteId: string): GroupNode | null {
  return allGroups(node).find((g) => g.tabs.includes(noteId)) ?? null
}

export function allOpenNoteIds(layout: WorkingLayout): string[] {
  return allGroups(layout.root).flatMap((g) => g.tabs)
}

// ---- immutable structural helpers ----------------------------------------

/** Replace the node whose id === targetId with `replacement` (or, if it returns
 *  null, remove it). Splits left with a single child collapse into that child;
 *  empty splits vanish. Returns the new (normalized) tree or null. */
function transform(
  node: PaneNode,
  targetId: string,
  replacement: (n: PaneNode) => PaneNode | null,
): PaneNode | null {
  if (node.id === targetId) return replacement(node)
  if (node.kind === 'group') return node
  const kept: PaneNode[] = []
  const keptSizes: number[] = []
  node.children.forEach((c, i) => {
    const t = transform(c, targetId, replacement)
    if (t !== null) {
      kept.push(t)
      keptSizes.push(node.sizes[i] ?? 1 / node.children.length)
    }
  })
  if (kept.length === 0) return null
  if (kept.length === 1) return kept[0] // collapse single-child split
  return { ...node, sizes: normalizeSizes(keptSizes, kept.length), children: kept }
}

function evenSizes(n: number): number[] {
  return Array.from({ length: n }, () => 1 / n)
}

function normalizeSizes(sizes: number[], n: number): number[] {
  const s = sizes.slice(0, n)
  while (s.length < n) s.push(1 / n)
  const sum = s.reduce((a, b) => a + b, 0)
  return sum > 0 ? s.map((x) => x / sum) : evenSizes(n)
}

/** Remove the group `id`, collapsing/pruning the tree; returns new root or null. */
function removeGroup(root: PaneNode, id: string): PaneNode | null {
  return transform(root, id, () => null)
}

/** Swap the value returned by `fn` in for the group `id` (structure preserved). */
function updateGroup(
  root: PaneNode,
  id: string,
  fn: (g: GroupNode) => GroupNode,
): PaneNode {
  const next = transform(root, id, (n) => (n.kind === 'group' ? fn(n) : n))
  return next ?? root
}

/** Pick a sensible activeTab after `removed` left the tab list. */
function neighbourTab(oldTabs: string[], removed: string): string | null {
  const idx = oldTabs.indexOf(removed)
  const remaining = oldTabs.filter((t) => t !== removed)
  if (remaining.length === 0) return null
  return remaining[Math.min(idx, remaining.length - 1)]
}

// ---- operations -----------------------------------------------------------

/** Open a note. If it's already open anywhere, focus that tab (v1 rule: a note
 *  opens once). Otherwise append it to the active group (creating a root group
 *  if the layout is empty) and make it active. */
export function openNote(layout: WorkingLayout, noteId: string): WorkingLayout {
  const existing = groupOf(layout.root, noteId)
  if (existing) {
    return {
      root: updateGroup(layout.root!, existing.id, (g) => ({ ...g, activeTab: noteId })),
      activeGroup: existing.id,
    }
  }
  if (!layout.root) {
    const g: GroupNode = { kind: 'group', id: newId(), tabs: [noteId], activeTab: noteId }
    return { root: g, activeGroup: g.id }
  }
  const targetId = (layout.activeGroup && findGroup(layout.root, layout.activeGroup)?.id) || firstGroup(layout.root)!.id
  return {
    root: updateGroup(layout.root, targetId, (g) => ({
      ...g,
      tabs: [...g.tabs, noteId],
      activeTab: noteId,
    })),
    activeGroup: targetId,
  }
}

/** Close a tab. Empties are pruned (single-child splits collapse); the last tab
 *  of the last group empties the whole surface (root → null). */
export function closeTab(layout: WorkingLayout, noteId: string, groupId?: string): WorkingLayout {
  if (!layout.root) return layout
  const g = groupId ? findGroup(layout.root, groupId) : groupOf(layout.root, noteId)
  if (!g || !g.tabs.includes(noteId)) return layout
  const remaining = g.tabs.filter((t) => t !== noteId)
  if (remaining.length > 0) {
    const activeTab = g.activeTab === noteId ? neighbourTab(g.tabs, noteId) : g.activeTab
    return {
      ...layout,
      root: updateGroup(layout.root, g.id, (grp) => ({ ...grp, tabs: remaining, activeTab })),
    }
  }
  // Group emptied → remove it.
  const nextRoot = removeGroup(layout.root, g.id)
  if (!nextRoot) return EMPTY_LAYOUT
  const activeGroup =
    layout.activeGroup && findGroup(nextRoot, layout.activeGroup)
      ? layout.activeGroup
      : firstGroup(nextRoot)!.id
  return { root: nextRoot, activeGroup }
}

/** Split a group, creating a sibling pane in the given direction and **moving a
 *  note into it** — by default the group's active tab (so a "split" button on a
 *  note shows that note in the new pane, per the user's expectation). The source
 *  pane is kept even if it empties (an empty pane accepts drops / the next
 *  opened note); the emptied *source* becomes active so opening another note
 *  lands beside the one you just split off. Pass `moveNoteId` to move a specific
 *  tab (drag-to-split). If the group has no tab to move, a plain empty pane is
 *  created and focused. */
export function splitGroup(
  layout: WorkingLayout,
  groupId: string,
  dir: 'row' | 'col',
  moveNoteId?: string,
): WorkingLayout {
  if (!layout.root) return layout
  const src = findGroup(layout.root, groupId)
  if (!src) return layout

  const noteToMove = moveNoteId ?? src.activeTab ?? undefined
  const moving = !!noteToMove && src.tabs.includes(noteToMove)

  const newGroup: GroupNode = {
    kind: 'group',
    id: newId(),
    tabs: moving ? [noteToMove!] : [],
    activeTab: moving ? noteToMove! : null,
  }
  const srcTabs = moving ? src.tabs.filter((t) => t !== noteToMove) : src.tabs
  const srcGroup: GroupNode = moving
    ? {
        ...src,
        tabs: srcTabs,
        activeTab: src.activeTab === noteToMove ? neighbourTab(src.tabs, noteToMove!) : src.activeTab,
      }
    : src

  const split: SplitNode = {
    kind: 'split',
    id: newId('s'),
    dir,
    sizes: [0.5, 0.5],
    children: [srcGroup, newGroup],
  }
  const root = transform(layout.root, groupId, () => split) ?? split
  // Focus the source pane: if it emptied (single-note split) it's the ready
  // target for the next opened note; if it kept tabs, focus stays put.
  return { root, activeGroup: srcGroup.id }
}

/** Close an entire pane (group) and everything in it, collapsing/rebalancing the
 *  tree — the surviving siblings auto-resize (transform renormalizes sizes). */
export function closeGroup(layout: WorkingLayout, groupId: string): WorkingLayout {
  if (!layout.root) return layout
  if (!findGroup(layout.root, groupId)) return layout
  const nextRoot = removeGroup(layout.root, groupId)
  if (!nextRoot) return EMPTY_LAYOUT
  const activeGroup =
    layout.activeGroup && findGroup(nextRoot, layout.activeGroup)
      ? layout.activeGroup
      : firstGroup(nextRoot)!.id
  return { root: nextRoot, activeGroup }
}

/** Move a tab to another group at an index (reorder within, or across groups). */
export function moveTab(
  layout: WorkingLayout,
  noteId: string,
  toGroupId: string,
  index: number,
): WorkingLayout {
  if (!layout.root) return layout
  const from = groupOf(layout.root, noteId)
  const to = findGroup(layout.root, toGroupId)
  if (!from || !to) return layout

  if (from.id === to.id) {
    const tabs = from.tabs.filter((t) => t !== noteId)
    tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, noteId)
    return {
      ...layout,
      root: updateGroup(layout.root, from.id, (g) => ({ ...g, tabs, activeTab: noteId })),
    }
  }

  // Remove from source (prune if it empties) then insert into target.
  let root: PaneNode | null = updateGroup(layout.root, from.id, (g) => ({
    ...g,
    tabs: g.tabs.filter((t) => t !== noteId),
    activeTab: g.activeTab === noteId ? neighbourTab(g.tabs, noteId) : g.activeTab,
  }))
  const srcAfter = findGroup(root, from.id)
  if (srcAfter && srcAfter.tabs.length === 0) root = removeGroup(root, from.id)
  if (!root) return layout
  // Target may have been collapsed away by a prune above — re-find.
  if (!findGroup(root, toGroupId)) return { root, activeGroup: firstGroup(root)!.id }
  root = updateGroup(root, toGroupId, (g) => {
    const tabs = g.tabs.slice()
    tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, noteId)
    return { ...g, tabs, activeTab: noteId }
  })
  return { root, activeGroup: toGroupId }
}

export function setActiveTab(layout: WorkingLayout, groupId: string, noteId: string): WorkingLayout {
  if (!layout.root) return layout
  const g = findGroup(layout.root, groupId)
  if (!g || !g.tabs.includes(noteId)) return layout
  return {
    root: updateGroup(layout.root, groupId, (grp) => ({ ...grp, activeTab: noteId })),
    activeGroup: groupId,
  }
}

export function setActiveGroup(layout: WorkingLayout, groupId: string): WorkingLayout {
  if (!layout.root || !findGroup(layout.root, groupId)) return layout
  return { ...layout, activeGroup: groupId }
}

/** Set the flex sizes of a split (from a divider drag). */
export function setSplitSizes(layout: WorkingLayout, splitId: string, sizes: number[]): WorkingLayout {
  if (!layout.root) return layout
  const root = transform(layout.root, splitId, (n) =>
    n.kind === 'split' ? { ...n, sizes: normalizeSizes(sizes, n.children.length) } : n,
  )
  return root ? { ...layout, root } : layout
}

/** Drop tabs pointing at notes that no longer exist; prune emptied groups.
 *  Run on restore-from-localStorage against the live note set. */
export function reconcile(layout: WorkingLayout, existingIds: Set<string>): WorkingLayout {
  if (!layout.root) return EMPTY_LAYOUT
  let root: PaneNode | null = layout.root
  for (const g of allGroups(layout.root)) {
    const tabs = g.tabs.filter((t) => existingIds.has(t))
    if (tabs.length === g.tabs.length) continue
    if (tabs.length === 0) {
      root = root ? removeGroup(root, g.id) : null
    } else {
      root = updateGroup(root!, g.id, (grp) => ({
        ...grp,
        tabs,
        activeTab: grp.activeTab && tabs.includes(grp.activeTab) ? grp.activeTab : tabs[0],
      }))
    }
  }
  if (!root) return EMPTY_LAYOUT
  const activeGroup =
    layout.activeGroup && findGroup(root, layout.activeGroup)
      ? layout.activeGroup
      : firstGroup(root)!.id
  // Nothing dropped → return the same reference so callers (and the store) can
  // skip a needless re-persist/re-render. `notes` changes identity on every
  // save, so reconcile runs often; this keeps it free when the layout is intact.
  if (root === layout.root && activeGroup === layout.activeGroup) return layout
  return { root, activeGroup }
}
