// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect } from 'vitest'
import { pickDirectional, startNode } from './keyNav'

const o = { x: 0, y: 0 }
describe('pickDirectional', () => {
  const c = [
    { id: 'u', x: 0, y: -10 },
    { id: 'd', x: 0, y: 10 },
    { id: 'l', x: -10, y: 0 },
    { id: 'r', x: 10, y: 0 },
  ]
  it('picks the obvious node per direction (y grows down)', () => {
    expect(pickDirectional(o, c, 'up')).toBe('u')
    expect(pickDirectional(o, c, 'down')).toBe('d')
    expect(pickDirectional(o, c, 'left')).toBe('l')
    expect(pickDirectional(o, c, 'right')).toBe('r')
  })
  it('prefers aligned over slightly closer diagonal', () => {
    const cs = [{ id: 'diag', x: 6, y: 6 }, { id: 'aligned', x: 10, y: 0 }]
    expect(pickDirectional(o, cs, 'right')).toBe('aligned')
  })
  it('null when nothing ahead, empty, or same point', () => {
    expect(pickDirectional(o, [{ id: 'l', x: -5, y: 0 }], 'right')).toBeNull()
    expect(pickDirectional(o, [], 'up')).toBeNull()
    expect(pickDirectional(o, [{ id: 's', x: 0, y: 0 }], 'up')).toBeNull()
  })
  it('ties go to the smaller id', () => {
    expect(pickDirectional(o, [{ id: 'b', x: 5, y: 0 }, { id: 'a', x: 5, y: 0 }], 'right')).toBe('a')
  })
})

describe('startNode', () => {
  const ns = [{ id: 'b', degree: 3 }, { id: 'a', degree: 3 }, { id: 'c', degree: 1 }]
  it('prefers the selected node when present', () => {
    expect(startNode(ns, 'c')).toBe('c')
  })
  it('else highest degree, ties to smallest id', () => {
    expect(startNode(ns, null)).toBe('a')
    expect(startNode(ns, 'gone')).toBe('a')
    expect(startNode([], null)).toBeNull()
  })
})
