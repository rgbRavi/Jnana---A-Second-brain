// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMotionApi, __resetMotionForTests } from '../../lib/motion/runtime'
import { resetPluginBudget } from '../../core/plugins/guard'
import { foldToBin, letterToNotes, transitionMs } from './effects'

const PID = 'jnana.motion.test'
let animateSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  animateSpy = vi.fn(() => ({ cancel: vi.fn(), finished: new Promise(() => {}) }))
  Element.prototype.animate = animateSpy as unknown as Element['animate']
})
afterEach(() => {
  __resetMotionForTests()
  resetPluginBudget(PID)
  document.body.innerHTML = ''
})

const layers = () => document.querySelectorAll(`[data-motion-layer="${PID}"]`)

describe('fold to bin', () => {
  it('animates a copy, never the real card, and nudges the bin', () => {
    document.body.innerHTML =
      '<div data-anchor="note" data-anchor-key="n1">A</div><button data-anchor="trash"></button>'
    const card = document.querySelector('[data-anchor="note"]')
    const bin = document.querySelector('[data-anchor="trash"]')
    foldToBin(createMotionApi(PID), 'n1')
    const targets = animateSpy.mock.contexts
    expect(targets).not.toContain(card)
    expect(targets).toContain(bin)
    expect(layers()).toHaveLength(1)
  })

  it('falls back to the sidebar Notes link when no bin is on screen', () => {
    document.body.innerHTML =
      '<div data-anchor="note" data-anchor-key="n1">A</div><a data-anchor="sidebar.notes"></a>'
    foldToBin(createMotionApi(PID), 'n1')
    expect(animateSpy.mock.contexts).toContain(document.querySelector('[data-anchor="sidebar.notes"]'))
  })

  it('skips when no target at all, or the note is not on screen', () => {
    document.body.innerHTML = '<div data-anchor="note" data-anchor-key="n1">A</div>'
    foldToBin(createMotionApi(PID), 'n1')
    foldToBin(createMotionApi(PID), 'missing')
    expect(animateSpy).not.toHaveBeenCalled()
    expect(layers()).toHaveLength(0)
  })

  it('crumples the larger of two on-screen anchors for the same note', () => {
    document.body.innerHTML =
      '<div data-anchor="note" data-anchor-key="n1">small</div>' +
      '<div data-anchor="note" data-anchor-key="n1">big</div>' +
      '<button data-anchor="trash"></button>'
    const [small, big] = Array.from(document.querySelectorAll('[data-anchor="note"]')) as HTMLElement[]
    small.getBoundingClientRect = () =>
      ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => {} }) as DOMRect
    big.getBoundingClientRect = () =>
      ({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => {} }) as DOMRect
    foldToBin(createMotionApi(PID), 'n1')
    const text = layers()[0].textContent ?? ''
    expect(text).toContain('big')
    expect(text).not.toContain('small')
  })

  it('folds in half, then throws a paper ball', () => {
    document.body.innerHTML =
      '<div data-anchor="note" data-anchor-key="n1">A</div><button data-anchor="trash"></button>'
    foldToBin(createMotionApi(PID), 'n1')
    const layer = layers()[0]
    const ball = layer.querySelector('[data-ball]')
    expect(ball).not.toBeNull()
    // The flap is animated around the midline; the ball is animated twice (appear, throw).
    const rotateX = animateSpy.mock.calls.find(([frames]) =>
      (frames as Keyframe[]).some((f) => String(f.transform).startsWith('rotateX')),
    )
    expect(rotateX).toBeDefined()
    expect(animateSpy.mock.contexts.filter((el) => el === ball)).toHaveLength(2)
  })

  it('keeps one transform shape per animation, so nothing matrix-spins', () => {
    document.body.innerHTML =
      '<div data-anchor="note" data-anchor-key="n1">A</div><button data-anchor="trash"></button>'
    foldToBin(createMotionApi(PID), 'n1')
    const shape = (t: unknown) => String(t).replace(/\([^)]*\)/g, '()')
    for (const [frames] of animateSpy.mock.calls) {
      const shapes = new Set((frames as Keyframe[]).filter((f) => f.transform).map((f) => shape(f.transform)))
      expect(shapes.size).toBeLessThanOrEqual(1)
    }
  })
})

describe('letter to Notes', () => {
  it('draws an envelope and an arrow toward the sidebar', () => {
    document.body.innerHTML = '<div data-anchor="composer">draft</div><a data-anchor="sidebar.notes"></a>'
    letterToNotes(createMotionApi(PID))
    const layer = layers()[0]
    expect(layer.querySelector('svg path')).not.toBeNull()
    expect(layer.querySelector('[data-letter]')).not.toBeNull()
    expect(animateSpy.mock.contexts).toContain(document.querySelector('[data-anchor="sidebar.notes"]'))
  })

  it('starts from the pill once the composer has tucked away', () => {
    document.body.innerHTML =
      '<div data-anchor="composer">draft</div><button data-anchor="composer.pill">pill</button>' +
      '<a data-anchor="sidebar.notes"></a>'
    letterToNotes(createMotionApi(PID))
    expect(layers()[0].textContent).toContain('pill')
    expect(layers()[0].textContent).not.toContain('draft')
  })

  it('measures the longest transition, in ms', () => {
    const el = document.createElement('div')
    el.style.transitionDuration = '0.42s, 220ms, 0s'
    document.body.appendChild(el)
    expect(transitionMs(el)).toBeCloseTo(420)
    expect(transitionMs(null)).toBe(0)
  })

  it('skips when the composer or the sidebar is missing', () => {
    document.body.innerHTML = '<div data-anchor="composer">draft</div>'
    letterToNotes(createMotionApi(PID))
    expect(layers()).toHaveLength(0)
  })
})
