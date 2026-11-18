// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import { compileGroup, describeGroup, isValidRegex, migrateGroups, newGroup, type GraphGroup } from './groupMatch'

const grp = (p: Partial<GraphGroup>): GraphGroup => ({ ...newGroup('blue'), id: 'g', ...p })
const fields = ({ id: _id, color: _c, ...r }: GraphGroup) => r

describe('migrateGroups', () => {
  it('migrates legacy #tag / tag: queries to exact tags', () => {
    for (const query of ['#cv', 'tag:cv']) {
      const [g] = migrateGroups([{ id: 'a', color: 'blue', query }])
      expect(fields(g)).toEqual({ match: 'all', tags: ['cv'], tagMode: 'any', titleOp: 'contains', titles: [] })
    }
  })
  it('migrates legacy plain text to a title "contains"; blank to an empty group', () => {
    expect(migrateGroups([{ id: 'a', color: 'blue', query: 'Lab' }])[0].titles).toEqual(['Lab'])
    const blank = migrateGroups([{ id: 'a', color: 'blue', query: '  ' }])[0]
    expect(blank.tags).toEqual([])
    expect(blank.titles).toEqual([])
  })
  it('merges the conditions-list shape into one tags line and one title line', () => {
    const [g] = migrateGroups([
      {
        id: 'a',
        color: 'blue',
        match: 'any',
        conditions: [
          { id: '1', kind: 'tags', tags: ['cv'], mode: 'all' },
          { id: '2', kind: 'title', op: 'starts', value: 'Lab' },
          { id: '3', kind: 'tags', tags: ['ml', 'cv'], mode: 'any' },
          { id: '4', kind: 'title', op: 'contains', value: 'Intro' },
          { id: '5', kind: 'title', op: 'contains', value: ' ' },
        ],
      },
    ])
    expect(fields(g)).toEqual({ match: 'any', tags: ['cv', 'ml'], tagMode: 'all', titleOp: 'starts', titles: ['Lab', 'Intro'] })
  })
  it('keeps the current shape and drops junk', () => {
    const ok = grp({ tags: ['a'] })
    expect(migrateGroups('nope')).toEqual([])
    expect(migrateGroups([null, { foo: 1 }, ok])).toEqual([ok])
  })
})

describe('compileGroup', () => {
  it('legacy #cv does not match cv-hl but matches CV', () => {
    const m = compileGroup(migrateGroups([{ id: 'a', color: 'blue', query: '#cv' }])[0])
    expect(m({ tags: ['cv-hl'] })).toBe(false)
    expect(m({ tags: ['CV'] })).toBe(true)
  })
  it('tag any / all', () => {
    const all = compileGroup(grp({ tags: ['cv', 'ml'], tagMode: 'all' }))
    expect(all({ tags: ['cv'] })).toBe(false)
    expect(all({ tags: ['cv', 'ml', 'x'] })).toBe(true)
    expect(compileGroup(grp({ tags: ['cv', 'ml'], tagMode: 'any' }))({ tags: ['ml'] })).toBe(true)
  })
  it('title ops', () => {
    const t = { title: 'Lab notes' }
    const m = (titleOp: GraphGroup['titleOp'], v: string) => compileGroup(grp({ titleOp, titles: [v] }))(t)
    expect(m('contains', 'notes')).toBe(true)
    expect(m('starts', 'lab')).toBe(true)
    expect(m('ends', 'NOTES')).toBe(true)
    expect(m('exact', 'lab notes')).toBe(true)
    expect(m('exact', 'lab')).toBe(false)
    expect(m('regex', '^lab[ ]')).toBe(true)
  })
  it('matches a title against any of several values', () => {
    const m = compileGroup(grp({ titleOp: 'starts', titles: ['Lab', 'Intro'] }))
    expect(m({ title: 'Intro to CV' })).toBe(true)
    expect(m({ title: 'Lab 2' })).toBe(true)
    expect(m({ title: 'Notes' })).toBe(false)
  })
  it('treats special characters literally outside regex mode', () => {
    expect(compileGroup(grp({ titleOp: 'starts', titles: ['C++ ('] }))({ title: 'C++ (intro)' })).toBe(true)
  })
  it('combines tags and titles with all (both) / any (either)', () => {
    const base = { tags: ['cv'], titleOp: 'starts' as const, titles: ['Lab'] }
    expect(compileGroup(grp({ ...base, match: 'all' }))({ title: 'Lab 1', tags: ['cv'] })).toBe(true)
    expect(compileGroup(grp({ ...base, match: 'all' }))({ title: 'Lab 1', tags: [] })).toBe(false)
    expect(compileGroup(grp({ ...base, match: 'any' }))({ title: 'Lab 1', tags: [] })).toBe(true)
  })
  it('skips invalid regex values instead of throwing or blanking the group', () => {
    const m = compileGroup(grp({ titleOp: 'regex', titles: ['(', 'lab'] }))
    expect(m({ title: 'My lab' })).toBe(true)
    expect(compileGroup(grp({ titleOp: 'regex', titles: ['('] }))({ title: '(' })).toBe(false)
  })
  it('an empty group matches nothing', () => {
    const m = compileGroup(grp({ titles: ['  '] }))
    expect(m({ title: 'anything', tags: ['x'] })).toBe(false)
    expect(m({})).toBe(false)
  })
})

describe('describeGroup', () => {
  it('reads as plain language', () => {
    expect(describeGroup(grp({ tags: ['cv', 'ml'], tagMode: 'any', titleOp: 'starts', titles: ['Lab', 'Intro'] }))).toBe(
      '#cv or #ml · title starts with Lab, Intro',
    )
    expect(describeGroup(grp({ tags: ['cv', 'ml'], tagMode: 'all', match: 'any' }))).toBe('#cv and #ml')
    expect(describeGroup(grp({}))).toBe('')
  })
})

describe('isValidRegex', () => {
  it('validates', () => {
    expect(isValidRegex('(')).toBe(false)
    expect(isValidRegex('^a')).toBe(true)
  })
})
