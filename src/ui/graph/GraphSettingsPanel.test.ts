// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../core/themes/apply'
import { GROUP_PALETTE, nextGroupColor } from './GraphSettingsPanel'

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]))

describe('GROUP_PALETTE', () => {
  it.each(GROUP_PALETTE)('$name has >=3:1 on dark and light backgrounds', ({ hex }) => {
    expect(contrastRatio(hex, '#0d0d0f')).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(hex, '#ffffff')).toBeGreaterThanOrEqual(3)
  })
  it.each(GROUP_PALETTE)('$name is clear of accent/warning/success', ({ hex }) => {
    for (const sem of ['#7c6af7', '#e3b341', '#3fb950']) expect(dist(hex, sem)).toBeGreaterThan(80)
  })
  it('auto-assigns the next unused colour', () => {
    expect(nextGroupColor([])).toBe(GROUP_PALETTE[0].hex)
    expect(nextGroupColor([GROUP_PALETTE[0].hex.toUpperCase()])).toBe(GROUP_PALETTE[1].hex)
  })
})
