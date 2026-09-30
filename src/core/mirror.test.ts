// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Folder, Note, Vault } from '../types'
import { DEFAULT_VAULT_ID } from '../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: vi.fn() }))
vi.mock('../lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
// 'deck' has a fixed projection, 'board' projects its raw content (like a
// canvas list with [[note:id]] cards), 'canvas' here has none.
vi.mock('../lib/noteTypes', () => ({
  getNoteType: (n: { kind?: string | null; content?: string }) =>
    n.kind === 'deck'
      ? { toExportMarkdown: () => 'Q: a\nA: b' }
      : n.kind === 'board'
        ? { toExportMarkdown: (x: { content: string }) => x.content }
        : n.kind
          ? {}
          : undefined,
}))
// The vault/folder tree mirrorNote/mirrorAll load; tests edit `folders`.
const vaults = [{ id: DEFAULT_VAULT_ID, name: 'V' }, { id: 'w', name: 'Work' }] as Vault[]
let folders: Folder[] = []
vi.mock('./vaults', () => ({ listVaults: vi.fn(async () => vaults) }))
vi.mock('./folders', () => ({ listFolders: vi.fn(async () => folders) }))

import { invoke } from '@tauri-apps/api/core'
import { toast } from '../lib/toast'
import { toExportMarkdown } from './export'
import {
  buildTree, isMirrorable, planSave, planDelete, loadIndex, saveIndex,
  mirrorNote, unmirrorNote, mirrorAll, MIRROR_README,
} from './mirror'

const note = (id: string, title: string, kind: string | null = null, extra: Partial<Note> = {}) =>
  ({ id, title, content: 'body', tags: [], kind, createdAt: 0, updatedAt: 0, ...extra }) as unknown as Note

const folder = (id: string, name: string, parentId: string | null = null, vaultId = DEFAULT_VAULT_ID, createdAt = 0) =>
  ({ id, name, parentId, vaultId, position: 0, createdAt, updatedAt: 0 }) as Folder

const T = buildTree(vaults, [folder('f', 'Physics'), folder('g', 'Waves', 'f'), folder('h', 'Q3', null, 'w')])

// Fake Rust: export_notes reports `failNames` it was asked to write as failed.
let allNotes: Note[] = []
let failNames: string[] = []
const fakeRust = async (cmd: string, args?: unknown) => {
  const a = args as { files?: { name: string }[] }
  if (cmd === 'export_notes') {
    const failed = failNames.filter((f) => a.files!.some((x) => x.name === f))
    return { written: a.files!.length - failed.length, failed }
  }
  if (cmd === 'get_all_notes') return allNotes
  return 0
}

beforeEach(() => {
  localStorage.clear()
  folders = []
  allNotes = []
  failNames = []
  vi.mocked(invoke).mockReset().mockImplementation(fakeRust as never)
  vi.mocked(toast.error).mockClear()
})

describe('planSave', () => {
  it('writes a new note under its title', () => {
    expect(planSave({}, note('n1', 'Title'), T)).toEqual({ index: { n1: 'V/Title.md' }, write: 'V/Title.md', remove: null, removeFirst: false })
  })

  it('re-saving keeps the same file', () => {
    expect(planSave({ n1: 'V/Same.md' }, note('n1', 'Same'), T)).toMatchObject({ write: 'V/Same.md', remove: null })
  })

  it('a rename removes the old file', () => {
    expect(planSave({ n1: 'V/Old.md' }, note('n1', 'New'), T)).toEqual({ index: { n1: 'V/New.md' }, write: 'V/New.md', remove: 'V/Old.md', removeFirst: false })
  })

  it('collision is case-insensitive', () => {
    const plan = planSave({ n2: 'V/Same.md' }, note('n1abcdefgh', 'same'), T)
    expect(plan.write).toBe('V/same (n1abcdef).md')
    expect(plan.index).toEqual({ n2: 'V/Same.md', n1abcdefgh: 'V/same (n1abcdef).md' })
  })

  it('a case-only rename removes the old casing before writing the new one', () => {
    expect(planSave({ n1: 'V/note.md' }, note('n1', 'Note'), T)).toMatchObject({ write: 'V/Note.md', remove: 'V/note.md', removeFirst: true })
  })

  it('an untitled note gets a usable name', () => {
    expect(planSave({}, note('n1', ''), T).write).toBe('V/Untitled.md')
  })

  it('a note that became a canvas is removed', () => {
    expect(planSave({ n1: 'V/C.md' }, note('n1', 'C', 'canvas'), T)).toEqual({ index: {}, write: null, remove: 'V/C.md', removeFirst: false })
  })

  it('nests a filed note under its vault and folder chain', () => {
    expect(planSave({}, note('n1', 'Doppler', null, { folderId: 'g' }), T).write).toBe('V/Physics/Waves/Doppler.md')
    expect(planSave({}, note('n2', 'Plan', null, { vaultId: 'w', folderId: 'h' }), T).write).toBe('Work/Q3/Plan.md')
  })

  it('a note whose folder is gone lands at its vault root', () => {
    expect(planSave({}, note('n1', 'Lost', null, { vaultId: 'w', folderId: 'missing' }), T).write).toBe('Work/Lost.md')
  })

  it('same title in different folders does not collide', () => {
    expect(planSave({ n2: 'V/Physics/Intro.md' }, note('n1', 'Intro'), T).write).toBe('V/Intro.md')
  })

  it('moving a note to another folder removes the old path', () => {
    expect(planSave({ n1: 'V/Doppler.md' }, note('n1', 'Doppler', null, { folderId: 'f' }), T))
      .toMatchObject({ write: 'V/Physics/Doppler.md', remove: 'V/Doppler.md' })
  })

  it('sibling folders and vaults with the same name get distinct directories', () => {
    const t = buildTree(
      [{ id: 'v1', name: 'Work', createdAt: 1 }, { id: 'v2abcdefgh', name: 'work', createdAt: 2 }] as Vault[],
      [folder('f1', 'Physics', null, 'v1', 1), folder('f2xxxxxxxx', 'Physics', null, 'v1', 2), folder('f3', 'Physics', null, 'v2abcdefgh', 3)],
    )
    expect(planSave({}, note('a', 'A', null, { vaultId: 'v2abcdefgh' }), t).write).toBe('work (v2abcdef)/A.md')
    expect(planSave({}, note('b', 'B', null, { vaultId: 'v1', folderId: 'f1' }), t).write).toBe('Work/Physics/B.md')
    expect(planSave({}, note('c', 'C', null, { vaultId: 'v1', folderId: 'f2xxxxxxxx' }), t).write).toBe('Work/Physics (f2xxxxxx)/C.md')
    expect(planSave({}, note('d', 'D', null, { vaultId: 'v2abcdefgh', folderId: 'f3' }), t).write).toBe('work (v2abcdef)/Physics/D.md')
  })
})

describe('isMirrorable', () => {
  it('plain notes and projected types yes, canvas no', () => {
    expect(isMirrorable(note('a', 'A'))).toBe(true)
    expect(isMirrorable(note('b', 'B', 'deck'))).toBe(true)
    expect(isMirrorable(note('c', 'C', 'canvas'))).toBe(false)
  })
})

describe('planDelete', () => {
  it('removes a known note and ignores an unknown one', () => {
    expect(planDelete({ n1: 'A.md', n2: 'B.md' }, 'n1')).toEqual({ index: { n2: 'B.md' }, write: null, remove: 'A.md', removeFirst: false })
    expect(planDelete({ n2: 'B.md' }, 'n1')).toEqual({ index: { n2: 'B.md' }, write: null, remove: null, removeFirst: false })
  })
})

describe('index storage', () => {
  it('is scoped to the folder it was written for', () => {
    saveIndex('D:/a', { n1: 'A.md' })
    expect(loadIndex('D:/a')).toEqual({ n1: 'A.md' })
    expect(loadIndex('D:/b')).toEqual({})
  })
})

describe('asset links', () => {
  it('toExportMarkdown points assets at the given dir', () => {
    expect(toExportMarkdown('![](jnana-asset://x.png)', '../../assets').markdown).toBe('![](../../assets/x.png)')
  })
})

const calls = () => vi.mocked(invoke).mock.calls.map(([cmd, args]) => [cmd, args] as [string, Record<string, unknown>])
const exports = () => calls().filter(([cmd]) => cmd === 'export_notes').map(([, a]) => a.files as { name: string; content: string }[])
const removes = () => calls().filter(([cmd]) => cmd === 'remove_export_files').map(([, a]) => a.names as string[])

describe('mirrorNote / unmirrorNote', () => {
  it('writes the note, then removes its old name after a rename', async () => {
    await mirrorNote('D:/m', note('n1', 'Old'))
    await mirrorNote('D:/m', note('n1', 'New'))
    const c = calls()
    expect(c[0][0]).toBe('export_notes')
    expect(exports()[0][0].name).toBe('V/Old.md')
    expect(exports()[0][0].content).toContain('id: "n1"')
    expect(c[1][0]).toBe('export_notes')
    expect(c[2]).toEqual(['remove_export_files', { dir: 'D:/m', names: ['V/Old.md'] }])
    expect(loadIndex('D:/m')).toEqual({ n1: 'V/New.md' })
  })

  it('a case-only rename removes the old file first', async () => {
    saveIndex('D:/m', { n1: 'V/note.md' })
    await mirrorNote('D:/m', note('n1', 'Note'))
    expect(calls().map(([cmd]) => cmd)).toEqual(['remove_export_files', 'export_notes'])
    expect(removes()[0]).toEqual(['V/note.md'])
    expect(exports()[0][0].name).toBe('V/Note.md')
  })

  it('a file the OS refuses keeps the old copy and is retried on the next save', async () => {
    saveIndex('D:/m', { n1: 'V/Old.md' })
    failNames = ['V/Bad.md']
    await mirrorNote('D:/m', note('n1', 'Bad'))
    expect(removes()).toEqual([])
    expect(loadIndex('D:/m')).toEqual({ n1: 'V/Old.md' })
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('V/Bad.md'))
  })

  it('a nested note links assets relative to its folder', async () => {
    folders = [folder('f', 'Physics')]
    await mirrorAll('D:/m', [note('n1', 'Pic', null, { folderId: 'f', content: '![](jnana-asset://x.png)' })])
    expect(exports()[0].find((f) => f.name === 'V/Physics/Pic.md')!.content).toContain('(../../assets/x.png)')
  })

  it('a canvas links its note cards by title', async () => {
    await mirrorNote('D:/m', note('b1', 'Alpha'))
    await mirrorNote('D:/m', note('c', 'Board', 'board', { content: '- [[note:b1]]' }))
    expect(exports()[1][0].content).toContain('- [[Alpha]]')
  })

  it('renaming a note rewrites the canvases that show it', async () => {
    const board = note('c', 'Board', 'board', { content: '- [[note:b1]]' })
    allNotes = [note('b1', 'Alpha'), board]
    await mirrorAll('D:/m', allNotes)
    vi.mocked(invoke).mockClear()
    allNotes = [note('b1', 'Beta'), board]
    await mirrorNote('D:/m', allNotes[0])
    await vi.waitFor(() =>
      expect(exports().flat().some((f) => f.name === 'V/Board.md' && f.content.includes('[[Beta]]'))).toBe(true),
    )
  })

  it('delete removes the file and forgets the note', async () => {
    saveIndex('D:/m', { n1: 'V/A.md' })
    await unmirrorNote('D:/m', 'n1')
    expect(calls()).toEqual([['remove_export_files', { dir: 'D:/m', names: ['V/A.md'] }]])
    expect(loadIndex('D:/m')).toEqual({})
  })
})

describe('mirrorAll', () => {
  it('writes every note plus the notice in one call', async () => {
    await mirrorAll('D:/m', [note('a', 'A'), note('c', 'C', 'canvas')])
    expect(calls()[0][0]).toBe('export_notes')
    expect(exports()[0].map((f) => f.name)).toEqual([MIRROR_README, 'V/A.md'])
  })

  it('mirrorAll never removes a name it just wrote', async () => {
    saveIndex('D:/m', { a: 'V/X.md' })
    await mirrorAll('D:/m', [note('a', 'Y'), note('b', 'X')])
    expect(removes()).toEqual([])
    expect(loadIndex('D:/m')).toEqual({ a: 'V/Y.md', b: 'V/X.md' })
  })

  it('removes files of notes that no longer exist and frees their names', async () => {
    saveIndex('D:/m', { gone: 'V/Old.md', a: 'V/A.md' })
    await mirrorAll('D:/m', [note('a', 'A')])
    expect(removes()).toEqual([['V/Old.md']])
    expect(loadIndex('D:/m')).toEqual({ a: 'V/A.md' })
  })

  it('without rewrite, only notes whose path changed are written', async () => {
    saveIndex('D:/m', { a: 'V/A.md', b: 'V/B.md' })
    folders = [folder('f', 'Renamed')]
    await mirrorAll('D:/m', [note('a', 'A'), note('b', 'B', null, { folderId: 'f' })], { rewrite: false })
    expect(exports()[0].map((f) => f.name)).toEqual([MIRROR_README, 'V/Renamed/B.md'])
    expect(removes()).toEqual([['V/B.md']])
  })

  it('a folder renamed only in case moves its files before writing', async () => {
    saveIndex('D:/m', { a: 'V/physics/A.md' })
    folders = [folder('f', 'Physics')]
    await mirrorAll('D:/m', [note('a', 'A', null, { folderId: 'f' })], { rewrite: false })
    expect(calls().map(([cmd]) => cmd)).toEqual(['remove_export_files', 'export_notes'])
    expect(removes()[0]).toEqual(['V/physics/A.md'])
    expect(exports()[0].map((f) => f.name)).toContain('V/Physics/A.md')
  })

  it('a file the OS refuses keeps its old copy and index entry', async () => {
    saveIndex('D:/m', { b: 'V/OldB.md' })
    failNames = ['V/B.md']
    await mirrorAll('D:/m', [note('a', 'A'), note('b', 'B')])
    expect(removes()).toEqual([])
    expect(loadIndex('D:/m')).toEqual({ a: 'V/A.md', b: 'V/OldB.md' })
  })

  it('rejects when the folder cannot be written', async () => {
    vi.mocked(invoke).mockRejectedValue('Not a directory: D:/gone')
    await expect(mirrorAll('D:/gone', [note('a', 'A')])).rejects.toBe('Not a directory: D:/gone')
  })
})

describe('outage', () => {
  it('catches up notes edited while the folder was unreachable', async () => {
    vi.mocked(invoke).mockRejectedValueOnce('Not a directory: D:/m')
    await mirrorNote('D:/m', note('a', 'A'))
    expect(loadIndex('D:/m')).toEqual({})
    allNotes = [note('a', 'A'), note('b', 'B')]
    await mirrorNote('D:/m', note('b', 'B'))
    await vi.waitFor(() => expect(loadIndex('D:/m')).toEqual({ a: 'V/A.md', b: 'V/B.md' }))
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it('failure toasts once and never rejects', async () => {
    vi.mocked(invoke).mockRejectedValue('Not a directory: D:/gone')
    await expect(mirrorNote('D:/gone', note('a', 'A'))).resolves.toBeUndefined()
    await expect(mirrorNote('D:/gone', note('a', 'A'))).resolves.toBeUndefined()
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(loadIndex('D:/gone')).toEqual({})
  })
})
