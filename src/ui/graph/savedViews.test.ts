// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { beforeEach, describe, expect, it } from 'vitest'
import { deleteView, getSavedViews, reloadSavedViews, renameView, saveView } from './savedViews'

beforeEach(() => {
  localStorage.clear()
  reloadSavedViews()
})

describe('savedViews store', () => {
  it('saves, renames, deletes and persists', () => {
    const v = saveView('  CV  ', { filterText: 'cv', camera: null })
    expect(getSavedViews()[0].name).toBe('CV')
    renameView(v.id, 'Thesis')
    reloadSavedViews()
    expect(getSavedViews()[0].name).toBe('Thesis')
    deleteView(v.id)
    expect(getSavedViews()).toEqual([])
  })

  it('overwrites a same-named view', () => {
    saveView('A', { filterText: 'x' })
    saveView('a', { filterText: 'y' })
    expect(getSavedViews()).toHaveLength(1)
    expect(getSavedViews()[0].state.filterText).toBe('y')
  })

  it('falls back to empty on bad JSON', () => {
    localStorage.setItem('jnana.graph.views', '{nope')
    reloadSavedViews()
    expect(getSavedViews()).toEqual([])
  })
})
