// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { buildTimeScope, buildScope, scopeKey, scopeLabel, emptyFocus, quizOriginOf, buildOpenQuizInput, openScopeHint, type FocusState } from './focusedScope'

describe('buildTimeScope', () => {
  it('is order-independent (swapped dates give the same window)', () => {
    const a = buildTimeScope('2026-01-10', '2026-01-20')
    const b = buildTimeScope('2026-01-20', '2026-01-10')
    expect(a).toEqual(b)
  })

  it('spans full days: since=start-of-day, until=end-of-day', () => {
    const s = buildTimeScope('2026-01-10', '2026-01-10')
    if (s.mode !== 'window') throw new Error('expected window')
    expect(new Date(s.since).getHours()).toBe(0)
    expect(s.until - s.since).toBeGreaterThan(23 * 60 * 60 * 1000) // ~one full day
    expect(s.label).toBe(new Date(s.since).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))
  })
})

describe('buildScope', () => {
  const base = emptyFocus()

  it('returns null for an empty topic', () => {
    expect(buildScope({ ...base, scopeKind: 'topic', topicPhrase: '   ' })).toBeNull()
  })

  it('trims the topic query', () => {
    expect(buildScope({ ...base, scopeKind: 'topic', topicPhrase: '  neural nets ' })).toEqual({ mode: 'topic', query: 'neural nets' })
  })

  it('returns null for note mode with no note selected', () => {
    expect(buildScope({ ...base, scopeKind: 'note', selectedNotes: [] })).toBeNull()
  })

  it('builds a note scope from every selected note, in pick order', () => {
    const selectedNotes = [{ id: 'n2', title: 'B' }, { id: 'n1', title: 'A' }]
    expect(buildScope({ ...base, scopeKind: 'note', selectedNotes })).toEqual({ mode: 'note', noteIds: ['n2', 'n1'] })
  })

  it('still reads a legacy single-note selection (older saved Focused turns)', () => {
    const legacy = { ...base, scopeKind: 'note', selectedNoteId: 'n9', selectedNoteTitle: 'Old' } as FocusState
    delete (legacy as Partial<FocusState>).selectedNotes
    expect(buildScope(legacy)).toEqual({ mode: 'note', noteIds: ['n9'] })
    expect(scopeLabel(legacy)).toBe('Note: Old')
  })

  it('labels one vs several notes', () => {
    expect(scopeLabel({ ...base, scopeKind: 'note', selectedNotes: [{ id: 'a', title: 'Tensors' }] })).toBe('Note: Tensors')
    expect(
      scopeLabel({ ...base, scopeKind: 'note', selectedNotes: [{ id: 'a', title: 'Tensors' }, { id: 'b', title: 'X' }, { id: 'c', title: 'Y' }] }),
    ).toBe('Notes: Tensors + 2 more')
  })

  it('time mode always yields a window', () => {
    const s = buildScope({ ...base, scopeKind: 'time' })
    expect(s?.mode).toBe('window')
  })
})

describe('scopeKey', () => {
  it('is stable + case-insensitive for topics', () => {
    expect(scopeKey({ mode: 'topic', query: 'Neural Nets' })).toBe(scopeKey({ mode: 'topic', query: 'neural nets' }))
  })

  it('differs across modes', () => {
    const keys = new Set([
      scopeKey({ mode: 'topic', query: 'x' }),
      scopeKey({ mode: 'note', noteIds: ['x'] }),
      scopeKey({ mode: 'window', since: 1, until: 2, label: 'l' }),
    ])
    expect(keys.size).toBe(3)
  })
})

describe('emptyFocus', () => {
  it('is unarmed with a topic default', () => {
    const f: FocusState = emptyFocus()
    expect(f.action).toBeNull()
    expect(f.scopeKind).toBe('topic')
  })
})

describe('open quiz origins', () => {
  const q = (o: Partial<FocusState>): FocusState => ({ ...emptyFocus(), action: 'quiz', ...o })
  it('defaults to notes', () => expect(quizOriginOf(emptyFocus())).toBe('notes'))
  it('web with links only', () => {
    expect(buildOpenQuizInput(q({ quizOrigin: 'web', links: 'https://a.com/x\nnope' }))).toEqual({ origin: 'web', topic: '', links: ['https://a.com/x'] })
  })
  it('web with neither is null', () => expect(buildOpenQuizInput(q({ quizOrigin: 'web', links: 'junk' }))).toBeNull())
  it('ai needs a topic', () => {
    expect(buildOpenQuizInput(q({ quizOrigin: 'ai' }))).toBeNull()
    expect(buildOpenQuizInput(q({ quizOrigin: 'ai', topicPhrase: ' tcp ' }))).toEqual({ origin: 'ai', topic: 'tcp', links: [] })
  })
  it('notes origin or non-quiz is null', () => {
    expect(buildOpenQuizInput(q({ topicPhrase: 'x' }))).toBeNull()
    expect(buildOpenQuizInput({ ...q({ quizOrigin: 'ai', topicPhrase: 'x' }), action: 'ask' })).toBeNull()
  })
  it('labels', () => {
    expect(scopeLabel(q({ quizOrigin: 'web', topicPhrase: 'rust' }))).toBe('Web: rust')
    expect(scopeLabel(q({ quizOrigin: 'web', links: 'https://a.com https://b.com' }))).toBe('Web: 2 links')
    expect(scopeLabel(q({ quizOrigin: 'ai', topicPhrase: 'rust' }))).toBe('AI knowledge: rust')
  })
  it('hints', () => {
    expect(openScopeHint('web')).toBe('Enter a topic or paste links to quiz on.')
    expect(openScopeHint('ai')).toBe('Enter a topic to quiz on.')
  })
})
