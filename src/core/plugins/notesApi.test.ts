// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The plugin notes API's boundary: the active vault. "Read and modify your notes"
// must not quietly mean every vault, including the one someone keeps separate.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Note } from '../../types'

const notes: Note[] = [
  { id: 'w1', title: 'Work plan', content: 'quarterly', tags: [], createdAt: 1, updatedAt: 1, vaultId: 'work' },
  { id: 'p1', title: 'Therapy notes', content: 'private things', tags: [], createdAt: 2, updatedAt: 2, vaultId: 'personal' },
  { id: 'd1', title: 'Unfiled', content: 'default vault', tags: [], createdAt: 3, updatedAt: 3 },
]

const saved = vi.fn(async (note: Note) => note)

vi.mock('../notes', () => ({
  getAllNotes: async () => notes,
  getNote: async (id: string) => {
    const found = notes.find((n) => n.id === id)
    if (!found) throw new Error('no such note')
    return found
  },
  saveNote: (note: Note) => saved(note),
  createNote: (title: string) => ({
    id: 'new',
    title,
    content: '',
    tags: [],
    createdAt: 9,
    updatedAt: 9,
  }),
}))

import { makePluginNotesApi } from './notesApi'
import { setActiveVaultId } from '../../lib/activeVault'

describe('plugin notes API vault scoping', () => {
  beforeEach(() => {
    saved.mockClear()
    setActiveVaultId('work')
  })

  it('returns only the active vault', async () => {
    const api = makePluginNotesApi('p.test')
    expect((await api.getAll()).map((n) => n.id)).toEqual(['w1'])

    setActiveVaultId('personal')
    expect((await api.getAll()).map((n) => n.id)).toEqual(['p1'])
  })

  it('treats a note with no vault as the default vault', async () => {
    setActiveVaultId('vault-default')
    const api = makePluginNotesApi('p.test')
    expect((await api.getAll()).map((n) => n.id)).toEqual(['d1'])
  })

  it('hides notes from other vaults by id and in search', async () => {
    const api = makePluginNotesApi('p.test')
    expect(await api.getById('w1')).toBeDefined()
    expect(await api.getById('p1')).toBeUndefined()
    expect(await api.search('things')).toEqual([])
    expect((await api.search('quarterly')).map((n) => n.id)).toEqual(['w1'])
  })

  it('refuses to write to a note in another vault', async () => {
    const api = makePluginNotesApi('p.test')
    await expect(api.saveContent('p1', 'overwritten')).rejects.toThrow(/active vault/)
    expect(saved).not.toHaveBeenCalled()

    await api.saveContent('w1', 'fine')
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1', content: 'fine' }))
  })

  it('creates notes into the active vault', async () => {
    const api = makePluginNotesApi('p.test')
    await api.create('From a plugin', 'body')
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'From a plugin', content: 'body', vaultId: 'work' }),
    )
  })
})
