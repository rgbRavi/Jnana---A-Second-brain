// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { resolveColor } from './themeColor'

describe('resolveColor', () => {
  it('re-expresses a hex at the requested alpha', () => {
    expect(resolveColor('#3fb950', 0.55)).toBe('rgba(63, 185, 80, 0.55)')
  })

  it('defaults to fully opaque', () => {
    expect(resolveColor('#3fb950')).toBe('rgba(63, 185, 80, 1)')
  })

  it('re-alphas a colour that already carries one', () => {
    expect(resolveColor('rgba(124, 106, 247, 0.9)', 0.4)).toBe('rgba(124, 106, 247, 0.4)')
  })

  it('leaves no probe element behind', () => {
    const before = document.body.childElementCount
    resolveColor('#000')
    expect(document.body.childElementCount).toBe(before)
  })
})
