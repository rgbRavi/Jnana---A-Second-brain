// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { buildTimeScope, buildScope, scopeKey, emptyFocus, type FocusState } from './focusedScope'

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
    expect(buildScope({ ...base, scopeKind: 'note', selectedNoteId: null })).toBeNull()
  })

  it('builds a note scope from the selected id', () => {
    expect(buildScope({ ...base, scopeKind: 'note', selectedNoteId: 'n1' })).toEqual({ mode: 'note', noteId: 'n1' })
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
      scopeKey({ mode: 'note', noteId: 'x' }),
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
