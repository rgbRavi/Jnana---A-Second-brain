// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import {
  EMPTY_LAYOUT,
  openNote,
  closeTab,
  closeGroup,
  splitGroup,
  splitBeside,
  closeOtherTabs,
  openNoteAt,
  moveTab,
  setActiveTab,
  reconcile,
  allGroups,
  allOpenNoteIds,
  groupOf,
  firstGroup,
  type WorkingLayout,
} from './layout'

/** Open a list of notes into a fresh layout (single group). */
function withNotes(...ids: string[]): WorkingLayout {
  return ids.reduce((l, id) => openNote(l, id), EMPTY_LAYOUT as WorkingLayout)
}

describe('openNote', () => {
  it('creates a root group for the first note', () => {
    const l = openNote(EMPTY_LAYOUT, 'a')
    expect(l.root?.kind).toBe('group')
    expect(allOpenNoteIds(l)).toEqual(['a'])
    expect(firstGroup(l.root)?.activeTab).toBe('a')
    expect(l.activeGroup).toBe(firstGroup(l.root)?.id)
  })

  it('appends to the active group and activates the new tab', () => {
    const l = withNotes('a', 'b', 'c')
    expect(allGroups(l.root)).toHaveLength(1)
    expect(firstGroup(l.root)?.tabs).toEqual(['a', 'b', 'c'])
    expect(firstGroup(l.root)?.activeTab).toBe('c')
  })

  it('focuses the existing tab instead of opening a note twice', () => {
    const l = openNote(withNotes('a', 'b'), 'a')
    expect(firstGroup(l.root)?.tabs).toEqual(['a', 'b']) // no duplicate
    expect(firstGroup(l.root)?.activeTab).toBe('a')
  })

  it('re-opening a note in another group focuses that group', () => {
    let l = withNotes('a', 'b')
    l = splitGroup(l, firstGroup(l.root)!.id, 'row') // new empty active group
    l = openNote(l, 'c') // lands in the new group
    // re-open 'a' which lives in the first group
    l = openNote(l, 'a')
    const holder = groupOf(l.root, 'a')!
    expect(l.activeGroup).toBe(holder.id)
    expect(holder.activeTab).toBe('a')
  })
})

describe('closeTab', () => {
  it('removes a tab and keeps the group', () => {
    const l = closeTab(withNotes('a', 'b', 'c'), 'b')
    expect(firstGroup(l.root)?.tabs).toEqual(['a', 'c'])
  })

  it('picks a neighbour as active when the active tab closes', () => {
    let l = withNotes('a', 'b', 'c')
    l = setActiveTab(l, firstGroup(l.root)!.id, 'b')
    l = closeTab(l, 'b')
    expect(firstGroup(l.root)?.activeTab).toBe('c')
  })

  it('empties the whole surface when the last tab of the last group closes', () => {
    let l = withNotes('a')
    l = closeTab(l, 'a')
    expect(l.root).toBeNull()
    expect(l.activeGroup).toBeNull()
  })

  it('prunes an emptied group and collapses the split', () => {
    let l = withNotes('a')
    l = splitGroup(l, firstGroup(l.root)!.id, 'row')
    l = openNote(l, 'b') // group2 = [b]
    expect(l.root?.kind).toBe('split')
    l = closeTab(l, 'b') // group2 empties → collapse back to a single group
    expect(l.root?.kind).toBe('group')
    expect(allOpenNoteIds(l)).toEqual(['a'])
    expect(l.activeGroup).toBe(firstGroup(l.root)?.id)
  })
})

describe('splitGroup', () => {
  it('moves the active note into the new pane and focuses the source', () => {
    let l = withNotes('a', 'b') // active tab is 'b'
    const g1 = firstGroup(l.root)!.id
    l = splitGroup(l, g1, 'row')
    expect(l.root?.kind).toBe('split')
    expect(allGroups(l.root)).toHaveLength(2)
    const src = allGroups(l.root).find((g) => g.id === g1)!
    const dst = allGroups(l.root).find((g) => g.id !== g1)!
    expect(src.tabs).toEqual(['a']) // active 'b' moved out
    expect(dst.tabs).toEqual(['b']) // ...into the new pane
    expect(l.activeGroup).toBe(g1) // focus stays on the source pane
  })

  it('splitting a single-note pane leaves an empty, focused source pane', () => {
    let l = withNotes('a')
    const g1 = firstGroup(l.root)!.id
    l = splitGroup(l, g1, 'row')
    expect(l.root?.kind).toBe('split')
    const src = allGroups(l.root).find((g) => g.id === g1)!
    const dst = allGroups(l.root).find((g) => g.id !== g1)!
    expect(src.tabs).toEqual([]) // ready to receive the next note
    expect(dst.tabs).toEqual(['a']) // the note shifted into the new pane
    expect(l.activeGroup).toBe(g1)
    // Opening a note now lands in the focused (empty) source pane.
    l = openNote(l, 'b')
    expect(allGroups(l.root).find((g) => g.id === g1)!.tabs).toEqual(['b'])
  })

  it('moves a specific tab when given moveNoteId', () => {
    let l = withNotes('a', 'b', 'c') // active 'c'
    const g1 = firstGroup(l.root)!.id
    l = splitGroup(l, g1, 'row', 'a')
    const src = allGroups(l.root).find((g) => g.id === g1)!
    const dst = allGroups(l.root).find((g) => g.id !== g1)!
    expect(src.tabs).toEqual(['b', 'c'])
    expect(dst.tabs).toEqual(['a'])
  })
})

describe('closeGroup', () => {
  it('removes a whole pane and collapses the split', () => {
    let l = withNotes('a', 'b')
    const g1 = firstGroup(l.root)!.id
    l = splitGroup(l, g1, 'row') // g1=[a], new=[b]
    const other = allGroups(l.root).find((g) => g.id !== g1)!.id
    l = closeGroup(l, other)
    expect(l.root?.kind).toBe('group')
    expect(allOpenNoteIds(l)).toEqual(['a'])
    expect(l.activeGroup).toBe(g1)
  })

  it('rebalances sizes of surviving panes', () => {
    let l = withNotes('a', 'b', 'c')
    let g = firstGroup(l.root)!.id
    l = splitGroup(l, g, 'row') // 2 panes
    g = l.activeGroup!
    l = splitGroup(l, g, 'row') // 3 panes total (nested), sizes present
    const groups = allGroups(l.root)
    expect(groups.length).toBe(3)
    l = closeGroup(l, groups[2].id)
    // Nothing throws and the tree stays valid with fewer panes.
    expect(allGroups(l.root).length).toBe(2)
  })

  it('empties the surface when the last pane closes', () => {
    let l = withNotes('a')
    l = closeGroup(l, firstGroup(l.root)!.id)
    expect(l.root).toBeNull()
  })
})

describe('moveTab', () => {
  it('reorders within a group', () => {
    let l = withNotes('a', 'b', 'c')
    const g = firstGroup(l.root)!.id
    l = moveTab(l, 'c', g, 0)
    expect(firstGroup(l.root)?.tabs).toEqual(['c', 'a', 'b'])
  })

  it('moves a tab across groups and prunes an emptied source', () => {
    let l = withNotes('a', 'b')
    const g1 = firstGroup(l.root)!.id
    l = splitGroup(l, g1, 'row', 'b') // g1=[a], g2=[b]
    const g2 = allGroups(l.root).find((g) => g.id !== g1)!.id
    l = moveTab(l, 'a', g2, 1) // move a into g2 → g1 empties → collapse
    expect(l.root?.kind).toBe('group')
    expect(firstGroup(l.root)?.tabs).toEqual(['b', 'a'])
  })
})

describe('reconcile', () => {
  it('drops tabs for notes that no longer exist', () => {
    const l = reconcile(withNotes('a', 'b', 'c'), new Set(['a', 'c']))
    expect(allOpenNoteIds(l)).toEqual(['a', 'c'])
  })

  it('prunes a group left empty and returns EMPTY when nothing survives', () => {
    const l = reconcile(withNotes('a'), new Set<string>())
    expect(l.root).toBeNull()
  })

  it('re-picks activeTab when the active note is gone', () => {
    let l = withNotes('a', 'b')
    l = setActiveTab(l, firstGroup(l.root)!.id, 'b')
    l = reconcile(l, new Set(['a']))
    expect(firstGroup(l.root)?.activeTab).toBe('a')
  })

  it('returns the same reference when nothing changed (skip re-persist)', () => {
    const l = withNotes('a', 'b')
    expect(reconcile(l, new Set(['a', 'b']))).toBe(l)
  })
})

describe('splitBeside', () => {
  it('moves a tab into a new pane on the given side of the anchor', () => {
    const l0 = withNotes('a', 'b')
    const anchor = firstGroup(l0.root)!.id
    const right = splitBeside(l0, anchor, 'right', 'b')
    expect(right.root?.kind === 'split' && right.root.dir).toBe('row')
    expect(allGroups(right.root).map((g) => g.tabs)).toEqual([['a'], ['b']])
    expect(right.activeGroup).toBe(groupOf(right.root, 'b')!.id)

    const above = splitBeside(l0, anchor, 'above', 'b')
    expect(above.root?.kind === 'split' && above.root.dir).toBe('col')
    expect(allGroups(above.root).map((g) => g.tabs)).toEqual([['b'], ['a']])
  })

  it('prunes the source pane it empties when that pane is not the anchor', () => {
    let l = withNotes('a')
    const anchor = firstGroup(l.root)!.id
    l = splitGroup(l, anchor, 'row') // ['a'] moves right; anchor left empty + active
    l = openNote(l, 'b') // b lands in the (active) left pane
    const left = groupOf(l.root, 'b')!.id
    l = splitBeside(l, left, 'below', 'a') // a's pane empties → pruned
    expect(allGroups(l.root).map((g) => g.tabs)).toEqual([['b'], ['a']])
    expect(l.root?.kind === 'split' && l.root.dir).toBe('col')
  })

  it("is a no-op for a pane's only tab split against that same pane", () => {
    const l = withNotes('a')
    expect(splitBeside(l, firstGroup(l.root)!.id, 'right', 'a')).toBe(l)
  })

  it('ignores an unknown note or anchor', () => {
    const l = withNotes('a')
    expect(splitBeside(l, 'nope', 'left', 'a')).toBe(l)
    expect(splitBeside(l, firstGroup(l.root)!.id, 'left', 'zzz')).toBe(l)
  })
})

describe('openNoteAt', () => {
  it('inserts a closed note at the index and focuses it', () => {
    const l0 = withNotes('a', 'b')
    const g = firstGroup(l0.root)!.id
    const l = openNoteAt(l0, 'c', g, 1)
    expect(firstGroup(l.root)?.tabs).toEqual(['a', 'c', 'b'])
    expect(firstGroup(l.root)?.activeTab).toBe('c')
  })

  it('moves an already-open note instead of duplicating it', () => {
    const l0 = withNotes('a', 'b', 'c')
    const l = openNoteAt(l0, 'c', firstGroup(l0.root)!.id, 0)
    expect(firstGroup(l.root)?.tabs).toEqual(['c', 'a', 'b'])
  })

  it('falls back to openNote on an empty layout', () => {
    expect(allOpenNoteIds(openNoteAt(EMPTY_LAYOUT, 'a', 'x', 0))).toEqual(['a'])
  })
})

describe('closeOtherTabs', () => {
  it('keeps only the chosen tab and makes it active', () => {
    const l0 = withNotes('a', 'b', 'c')
    const l = closeOtherTabs(l0, firstGroup(l0.root)!.id, 'b')
    expect(firstGroup(l.root)?.tabs).toEqual(['b'])
    expect(firstGroup(l.root)?.activeTab).toBe('b')
  })
  it('is a no-op for a lone tab or a tab not in the group', () => {
    const l = withNotes('a')
    expect(closeOtherTabs(l, firstGroup(l.root)!.id, 'a')).toBe(l)
    expect(closeOtherTabs(l, firstGroup(l.root)!.id, 'zzz')).toBe(l)
  })
})
