// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The runtime's job is that a motion plugin can't leave the app broken: real UI
// springs back, caps hold, and every teardown path removes everything.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createMotionApi,
  disposeMotion,
  panicMotion,
  __resetMotionForTests,
  MAX_ANIMATION_MS,
  MAX_CLONES,
} from './runtime'
import { resetPluginBudget } from '../../core/plugins/guard'

const PID = 'test.motion'

function fakeAnimation(): Animation {
  return { cancel: vi.fn(), finished: new Promise<Animation>(() => {}) } as unknown as Animation
}

let animateSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  animateSpy = vi.fn(() => fakeAnimation())
  Element.prototype.animate = animateSpy as unknown as Element['animate']
  document.body.innerHTML = '<div data-anchor="note" data-anchor-key="n1"><iframe></iframe>hi</div>'
})

afterEach(() => {
  __resetMotionForTests()
  resetPluginBudget(PID)
  document.documentElement.style.removeProperty('--motion-scale')
  document.body.innerHTML = ''
  vi.useRealTimers()
})

const card = () => document.querySelector('[data-anchor="note"]') as HTMLElement

describe('motion runtime', () => {
  it('forces real UI to spring back, lets own layer content hold', () => {
    const m = createMotionApi(PID)
    m.animate(card(), [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' })
    expect(animateSpy.mock.calls[0][1].fill).toBe('none')
    const copy = m.clone(card())!
    m.animate(copy, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' })
    expect(animateSpy.mock.calls[1][1].fill).toBe('forwards')
  })

  it('clamps duration and total iterations', () => {
    const m = createMotionApi(PID)
    m.animate(card(), [{}, {}], { duration: 999_999 })
    expect(animateSpy.mock.calls[0][1].duration).toBe(MAX_ANIMATION_MS)
    m.animate(card(), [{}, {}], { duration: 1000, iterations: Infinity })
    expect(animateSpy.mock.calls[1][1].iterations).toBe(1)
    m.animate(card(), [{}, {}], { duration: 1000, iterations: 50 })
    expect(animateSpy.mock.calls[2][1].iterations).toBe(10)
  })

  it('clone strips media and anchors, and caps live clones', () => {
    const m = createMotionApi(PID)
    const copy = m.clone(card())!
    expect(copy.querySelector('iframe')).toBeNull()
    expect(copy.hasAttribute('data-anchor')).toBe(false)
    expect(copy.hasAttribute('inert')).toBe(true)
    for (let i = 1; i < MAX_CLONES; i++) expect(m.clone(card())).not.toBeNull()
    expect(m.clone(card())).toBeNull()
  })

  it('dispose cancels animations, removes layers, stops timers', () => {
    vi.useFakeTimers()
    const m = createMotionApi(PID)
    const tick = vi.fn()
    m.every(300, tick)
    m.overlay()
    const anim = m.animate(card(), [{}, {}], { duration: 500 })!
    disposeMotion(PID)
    vi.advanceTimersByTime(2000)
    expect(tick).not.toHaveBeenCalled()
    expect(anim.cancel).toHaveBeenCalled()
    expect(document.querySelectorAll(`[data-motion-layer="${PID}"]`)).toHaveLength(0)
    expect(m.animate(card(), [{}, {}], { duration: 100 })).toBeNull()
  })

  it('goes quiet under reduced motion, including handlers already installed', () => {
    vi.useFakeTimers()
    const m = createMotionApi(PID)
    const tick = vi.fn()
    m.every(300, tick)
    vi.advanceTimersByTime(300)
    expect(tick).toHaveBeenCalledTimes(1)
    document.documentElement.style.setProperty('--motion-scale', '0')
    vi.advanceTimersByTime(900)
    expect(tick).toHaveBeenCalledTimes(1)
    expect(m.reduced()).toBe(true)
    expect(m.animate(card(), [{}, {}], { duration: 100 })).toBeNull()
  })

  it('stops a plugin whose handlers keep throwing', () => {
    const m = createMotionApi(PID)
    const handler = vi.fn(() => {
      throw new Error('boom')
    })
    m.listen('note', 'click', handler)
    for (let i = 0; i < 7; i++) card().click()
    expect(handler).toHaveBeenCalledTimes(5)
  })

  it('listen passes the anchored element', () => {
    const m = createMotionApi(PID)
    const seen: HTMLElement[] = []
    m.listen('note', 'click', (el) => seen.push(el))
    card().click()
    expect(seen[0]).toBe(card())
  })

  it('panic stops every plugin until restart', () => {
    const a = createMotionApi('a.plugin')
    const b = createMotionApi('b.plugin')
    a.overlay()
    b.overlay()
    panicMotion()
    expect(document.querySelectorAll('[data-motion-layer]')).toHaveLength(0)
    expect(a.reduced()).toBe(true)
    expect(b.animate(card(), [{}, {}], { duration: 100 })).toBeNull()
    resetPluginBudget('a.plugin')
    resetPluginBudget('b.plugin')
  })

  it('missing anchor is null, not a throw', () => {
    const m = createMotionApi(PID)
    expect(m.anchor('trash')).toBeNull()
    expect(m.anchors('nope')).toEqual([])
  })
})
