// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { buildFolderTree, descendantFolderIds } from './useFolders'
import type { Folder } from '../types'

const f = (id: string, parentId: string | null, name = id, position = 0): Folder => ({
  id,
  parentId,
  name,
  position,
  vaultId: 'vault-default',
  createdAt: 0,
  updatedAt: 0,
})

describe('buildFolderTree', () => {
  it('nests children under parents and keeps roots at top level', () => {
    const flat = [f('a', null), f('b', 'a'), f('c', 'a'), f('d', 'b'), f('e', null)]
    const tree = buildFolderTree(flat)

    expect(tree.map((n) => n.id)).toEqual(['a', 'e'])
    const a = tree.find((n) => n.id === 'a')!
    expect(a.children.map((n) => n.id)).toEqual(['b', 'c'])
    const b = a.children.find((n) => n.id === 'b')!
    expect(b.children.map((n) => n.id)).toEqual(['d'])
  })

  it('preserves incoming sibling order', () => {
    const flat = [f('z', null, 'z', 1), f('y', null, 'y', 2), f('x', null, 'x', 3)]
    expect(buildFolderTree(flat).map((n) => n.id)).toEqual(['z', 'y', 'x'])
  })

  it('treats a folder with a dangling parent as a root (defensive)', () => {
    const flat = [f('orphan', 'gone')]
    expect(buildFolderTree(flat).map((n) => n.id)).toEqual(['orphan'])
  })

  it('returns an empty array for no folders', () => {
    expect(buildFolderTree([])).toEqual([])
  })
})

describe('descendantFolderIds', () => {
  it('returns every descendant, excluding the folder itself', () => {
    const flat = [f('a', null), f('b', 'a'), f('c', 'a'), f('d', 'b'), f('e', 'd')]
    expect(descendantFolderIds(flat, 'a').sort()).toEqual(['b', 'c', 'd', 'e'])
    expect(descendantFolderIds(flat, 'b').sort()).toEqual(['d', 'e'])
  })

  it('returns an empty array for a leaf folder', () => {
    const flat = [f('a', null), f('b', 'a')]
    expect(descendantFolderIds(flat, 'b')).toEqual([])
  })
})
