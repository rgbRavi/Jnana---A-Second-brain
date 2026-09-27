// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The sample is what plugin authors copy, so it must stay on the contract: only
// published anchors, the motion permission, and graceful when motion is absent.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from './src/index.js'
import { MOTION_ANCHORS } from '../../src/lib/motion/anchors'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'))
const source = readFileSync(join(here, 'src/index.js'), 'utf8')

describe('sample motion plugin', () => {
  it('declares motion and matches its manifest', () => {
    expect(manifest.permissions).toEqual(['motion'])
    expect(plugin.id).toBe(manifest.id)
  })

  it('uses only published anchors', () => {
    const used = [...source.matchAll(/anchor\('([^']+)'|listen\('([^']+)'/g)].map((m) => m[1] ?? m[2])
    expect(used.length).toBeGreaterThan(0)
    for (const name of used) expect(Object.keys(MOTION_ANCHORS)).toContain(name)
  })

  it('wires one trigger of each kind', () => {
    const motion = { listen: vi.fn(), idle: vi.fn(), anchor: vi.fn(() => null), overlay: vi.fn(), animate: vi.fn() }
    const bus = { on: vi.fn(), emit: vi.fn() }
    plugin.init({ pluginId: plugin.id, bus, motion })
    expect(bus.on).toHaveBeenCalledWith('composer:saving', expect.any(Function))
    expect(motion.listen).toHaveBeenCalledWith('sidebar.notes', 'click', expect.any(Function))
    expect(motion.idle).toHaveBeenCalled()
  })

  it('does nothing without motion (not granted, or sandboxed runtime)', () => {
    const bus = { on: vi.fn(), emit: vi.fn() }
    expect(() => plugin.init({ pluginId: plugin.id, bus })).not.toThrow()
    expect(bus.on).not.toHaveBeenCalled()
  })
})
