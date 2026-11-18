// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect } from 'vitest'
import { linksScale, editedScale, sizeScale } from './nodeSize'

describe('nodeSize', () => {
  it('links scale grows and is capped', () => {
    expect(linksScale(0)).toBe(1)
    expect(linksScale(3)).toBeGreaterThan(linksScale(1))
    expect(linksScale(1e9)).toBe(2.2)
  })
  it('edited scale steps by recency', () => {
    const now = 100 * 86_400_000
    expect(editedScale(now - 1000, now)).toBe(1.8)
    expect(editedScale(now - 3 * 86_400_000, now)).toBe(1.4)
    expect(editedScale(now - 20 * 86_400_000, now)).toBe(1.15)
    expect(editedScale(0, now)).toBe(1)
  })
  it('same is 1', () => expect(sizeScale('same', 9, 0, 1)).toBe(1))
})
