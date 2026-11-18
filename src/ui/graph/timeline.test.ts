// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, expect, it } from 'vitest'
import { buildTimelineSteps, stepDelayMs, timeRange, visibleAt, visibleIds, visibleAtStep } from './timeline'

describe('timeRange', () => {
  it('is null for no notes', () => expect(timeRange([])).toBeNull())
  it('single date gives min === max', () => expect(timeRange([{ createdAt: 5 }])).toEqual({ min: 5, max: 5 }))
  it('spans min..max and ignores pseudo-nodes', () =>
    expect(timeRange([{ createdAt: 9 }, { createdAt: 2 }, { isPseudo: true, createdAt: 99 }])).toEqual({ min: 2, max: 9 }))
})

describe('visibleAt', () => {
  it('boundary is inclusive', () => {
    expect(visibleAt(5, 5)).toBe(true)
    expect(visibleAt(6, 5)).toBe(false)
  })
})

describe('visibleIds', () => {
  const nodes = [
    { id: 'a', createdAt: 1 },
    { id: 'b', createdAt: 5 },
    { id: 'p', isPseudo: true },
  ]
  const links = [{ source: 'a', target: 'p' }, { source: { id: 'b' }, target: { id: 'p' } }]
  it('hides later notes; pseudo shows once a visible note links to it', () => {
    expect([...visibleIds(nodes, links, 0)]).toEqual([])
    expect([...visibleIds(nodes, links, 1)].sort()).toEqual(['a', 'p'])
    expect([...visibleIds(nodes, links, 5)].sort()).toEqual(['a', 'b', 'p'])
  })
  it('pseudo with no visible referrer stays hidden', () => {
    expect(visibleIds([{ id: 'b', createdAt: 5 }, { id: 'p', isPseudo: true }], [{ source: 'b', target: 'p' }], 1).size).toBe(0)
  })
})

describe('buildTimelineSteps', () => {
  const nodes = [
    { id: 'b', createdAt: 5 },
    { id: 'a', createdAt: 1 },
    { id: 'c', createdAt: 5 },
    { id: 'p', isPseudo: true },
  ]
  it('is empty for no input', () => expect(buildTimelineSteps([], [])).toEqual([]))
  it('orders notes by date then id; link only after both ends exist', () => {
    const steps = buildTimelineSteps(nodes, [{ source: 'a', target: 'b' }, { source: { id: 'c' }, target: { id: 'b' } }])
    expect(steps.map((s) => (s.kind === 'note' ? s.id : `${s.source}>${s.target}`))).toEqual(['a', 'b', 'a>b', 'c', 'c>b'])
    expect(steps[2].at).toBe(5)
  })
  it('pseudo link appears right after the first referencing note, once per referrer', () => {
    const steps = buildTimelineSteps(nodes, [{ source: 'b', target: 'p' }, { source: 'a', target: 'p' }])
    expect(steps.map((s) => (s.kind === 'note' ? s.id : `${s.source}>${s.target}`))).toEqual(['a', 'a>p', 'b', 'b>p', 'c'])
  })
  it('visibleAtStep', () => {
    const steps = buildTimelineSteps(nodes, [{ source: 'b', target: 'p' }, { source: 'a', target: 'b' }])
    expect(visibleAtStep(steps, 0)).toEqual({ nodes: new Set(), links: new Set() })
    const two = visibleAtStep(steps, 2)
    expect([...two.nodes].sort()).toEqual(['a', 'b'])
    expect(two.links.size).toBe(0)
    const all = visibleAtStep(steps, steps.length)
    expect([...all.nodes].sort()).toEqual(['a', 'b', 'c', 'p'])
    expect([...all.links].sort()).toEqual(['a|b', 'b|p'])
  })
})

describe('stepDelayMs', () => {
  it('is 500ms divided by speed', () => {
    expect([1, 2, 4].map(stepDelayMs)).toEqual([500, 250, 125])
  })
})
