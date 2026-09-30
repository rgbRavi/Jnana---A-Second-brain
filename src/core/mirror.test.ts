// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Note } from '../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(0)) }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: vi.fn() }))
vi.mock('../lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
// 'deck' has a markdown projection; 'canvas' doesn't.
vi.mock('../lib/noteTypes', () => ({
  getNoteType: (n: { kind?: string | null }) =>
    n.kind === 'deck' ? { toExportMarkdown: () => 'Q: a\nA: b' } : n.kind ? {} : undefined,
}))

import { invoke } from '@tauri-apps/api/core'
import { toast } from '../lib/toast'
import { isMirrorable, planSave, planDelete, loadIndex, saveIndex, mirrorNote, unmirrorNote, mirrorAll, MIRROR_README } from './mirror'

const note = (id: string, title: string, kind: string | null = null) =>
  ({ id, title, content: 'body', tags: [], kind, createdAt: 0, updatedAt: 0 }) as unknown as Note

beforeEach(() => {
  localStorage.clear()
  vi.mocked(invoke).mockReset().mockResolvedValue(0)
  vi.mocked(toast.error).mockClear()
})

describe('planSave', () => {
  it('writes a new note under its title', () => {
    expect(planSave({}, note('n1', 'Title'))).toEqual({ index: { n1: 'Title.md' }, write: 'Title.md', remove: null })
  })

  it('re-saving keeps the same file', () => {
    expect(planSave({ n1: 'Same.md' }, note('n1', 'Same'))).toMatchObject({ write: 'Same.md', remove: null })
  })

  it('a rename removes the old file', () => {
    expect(planSave({ n1: 'Old.md' }, note('n1', 'New'))).toEqual({ index: { n1: 'New.md' }, write: 'New.md', remove: 'Old.md' })
  })

  it('collision is case-insensitive', () => {
    const plan = planSave({ n2: 'Same.md' }, note('n1abcdefgh', 'same'))
    expect(plan.write).toBe('same (n1abcdef).md')
    expect(plan.index).toEqual({ n2: 'Same.md', n1abcdefgh: 'same (n1abcdef).md' })
  })

  it('case-only rename keeps the file', () => {
    expect(planSave({ n1: 'note.md' }, note('n1', 'Note'))).toMatchObject({ write: 'Note.md', remove: null })
  })

  it('an untitled note gets a usable name', () => {
    expect(planSave({}, note('n1', '')).write).toBe('Untitled.md')
  })

  it('a note that became a canvas is removed', () => {
    expect(planSave({ n1: 'C.md' }, note('n1', 'C', 'canvas'))).toEqual({ index: {}, write: null, remove: 'C.md' })
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
    expect(planDelete({ n1: 'A.md', n2: 'B.md' }, 'n1')).toEqual({ index: { n2: 'B.md' }, write: null, remove: 'A.md' })
    expect(planDelete({ n2: 'B.md' }, 'n1')).toEqual({ index: { n2: 'B.md' }, write: null, remove: null })
  })
})

describe('index storage', () => {
  it('is scoped to the folder it was written for', () => {
    saveIndex('D:/a', { n1: 'A.md' })
    expect(loadIndex('D:/a')).toEqual({ n1: 'A.md' })
    expect(loadIndex('D:/b')).toEqual({})
  })
})

const calls = () => vi.mocked(invoke).mock.calls.map(([cmd, args]) => [cmd, args] as [string, Record<string, unknown>])

describe('mirrorNote / unmirrorNote', () => {
  it('writes the note, then removes its old name after a rename', async () => {
    await mirrorNote('D:/m', note('n1', 'Old'))
    await mirrorNote('D:/m', note('n1', 'New'))
    const c = calls()
    expect(c[0][0]).toBe('export_notes')
    const first = c[0][1].files as { name: string; content: string }[]
    expect(first[0].name).toBe('Old.md')
    expect(first[0].content).toContain('id: "n1"')
    expect(c[1][0]).toBe('export_notes')
    expect(c[2]).toEqual(['remove_export_files', { dir: 'D:/m', names: ['Old.md'] }])
    expect(loadIndex('D:/m')).toEqual({ n1: 'New.md' })
  })

  it('delete removes the file and forgets the note', async () => {
    saveIndex('D:/m', { n1: 'A.md' })
    await unmirrorNote('D:/m', 'n1')
    expect(calls()).toEqual([['remove_export_files', { dir: 'D:/m', names: ['A.md'] }]])
    expect(loadIndex('D:/m')).toEqual({})
  })
})

describe('mirrorAll', () => {
  it('writes every note plus the notice in one call', async () => {
    await mirrorAll('D:/m', [note('a', 'A'), note('c', 'C', 'canvas')])
    const [[cmd, args]] = calls()
    expect(cmd).toBe('export_notes')
    expect((args.files as { name: string }[]).map((f) => f.name)).toEqual([MIRROR_README, 'A.md'])
  })

  it('mirrorAll never removes a name it just wrote', async () => {
    saveIndex('D:/m', { a: 'X.md' })
    await mirrorAll('D:/m', [note('a', 'Y'), note('b', 'X')])
    expect(calls().some(([cmd]) => cmd === 'remove_export_files')).toBe(false)
    expect(loadIndex('D:/m')).toEqual({ a: 'Y.md', b: 'X.md' })
  })

  it('rejects when the folder cannot be written', async () => {
    vi.mocked(invoke).mockRejectedValue('Not a directory: D:/gone')
    await expect(mirrorAll('D:/gone', [note('a', 'A')])).rejects.toBe('Not a directory: D:/gone')
  })
})

describe('failure', () => {
  it('failure toasts once and never rejects', async () => {
    vi.mocked(invoke).mockRejectedValue('Not a directory: D:/gone')
    await expect(mirrorNote('D:/gone', note('a', 'A'))).resolves.toBeUndefined()
    await expect(mirrorNote('D:/gone', note('a', 'A'))).resolves.toBeUndefined()
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(loadIndex('D:/gone')).toEqual({})
  })
})
