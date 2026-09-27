// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from './src/index.js'
import { MOTION_ANCHORS } from '../../src/lib/motion/anchors'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'))
const source = readFileSync(join(here, 'src/index.js'), 'utf8')

function harness() {
  const handlers = {}
  let onClick
  const main = document.createElement('main')
  main.getBoundingClientRect = () => ({ left: 200, top: 0, width: 800, height: 600 })
  const motion = {
    anchor: vi.fn((name) => (name === 'main' ? main : null)),
    overlay: vi.fn(() => document.body.appendChild(document.createElement('div'))),
    animate: vi.fn(),
    listen: vi.fn((_a, _t, fn) => void (onClick = fn)),
  }
  const bus = { on: (e, fn) => void (handlers[e] = fn), emit: vi.fn() }
  plugin.init({ pluginId: plugin.id, bus, motion })
  return {
    motion,
    click: (x, y) => onClick(null, { clientX: x, clientY: y }),
    route: () => handlers['route:changed']({ path: '/x' }),
  }
}

describe('Ink Portal', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('declares motion and matches its manifest', () => {
    expect(manifest.permissions).toEqual(['motion'])
    expect(plugin.id).toBe(manifest.id)
  })

  it('uses only published anchors', () => {
    const used = [...source.matchAll(/anchor\('([^']+)'|listen\('([^']+)'/g)].map((m) => m[1] ?? m[2])
    expect(used.length).toBeGreaterThan(0)
    for (const name of used) expect(Object.keys(MOTION_ANCHORS)).toContain(name)
  })

  it('splashes when a sidebar click changes the view', () => {
    const h = harness()
    h.click(40, 120)
    h.route()
    expect(h.motion.overlay).toHaveBeenCalledOnce()
    const wash = h.motion.animate.mock.calls[0][1]
    expect(wash[0].clipPath).toBe('circle(0px at -160px 120px)')
  })

  it('does nothing on first mount, or when the click did not navigate', () => {
    const h = harness()
    h.route() // mount: no click
    h.click(40, 120)
    vi.advanceTimersByTime(1000) // click that didn't change the route
    h.route()
    expect(h.motion.overlay).not.toHaveBeenCalled()
  })

  it('cleans up its layer', () => {
    const h = harness()
    h.click(40, 120)
    h.route()
    vi.advanceTimersByTime(1000)
    expect(document.body.children).toHaveLength(0)
  })

  it('does nothing without motion', () => {
    const bus = { on: vi.fn(), emit: vi.fn() }
    expect(() => plugin.init({ pluginId: plugin.id, bus })).not.toThrow()
    expect(bus.on).not.toHaveBeenCalled()
  })
})
