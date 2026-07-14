// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, afterEach } from 'vitest'
import {
  registerNoteType,
  unregisterNoteType,
  getNoteType,
  getNoteTypeById,
  listNoteTypes,
  noteSearchText,
  type NoteTypeDefinition,
} from './noteTypes'
import type { Note } from '../types'

const Dummy = () => null

const def: NoteTypeDefinition = {
  id: 'test-type',
  label: 'Test type',
  View: Dummy,
  Editor: Dummy,
  toSearchText: (n) => `projected:${n.id}`,
}

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  title: '',
  content: '{"x":1}',
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

afterEach(() => unregisterNoteType('test-type'))

describe('noteTypes registry', () => {
  it('resolves a registered type by note.kind and lists it', () => {
    registerNoteType(def)
    expect(getNoteTypeById('test-type')).toBe(def)
    expect(getNoteType(note({ kind: 'test-type' }))).toBe(def)
    expect(listNoteTypes()).toContain(def)
  })

  it('returns undefined for plain notes or unknown kinds', () => {
    expect(getNoteType(note())).toBeUndefined()
    expect(getNoteType(note({ kind: 'nope' }))).toBeUndefined()
  })

  it('noteSearchText uses the type projection, else raw content', () => {
    registerNoteType(def)
    expect(noteSearchText(note({ kind: 'test-type' }))).toBe('projected:n1')
    // Plain note falls back to its content verbatim.
    expect(noteSearchText(note({ content: 'hello' }))).toBe('hello')
  })

  it('unregister removes the type', () => {
    registerNoteType(def)
    unregisterNoteType('test-type')
    expect(getNoteTypeById('test-type')).toBeUndefined()
  })
})
