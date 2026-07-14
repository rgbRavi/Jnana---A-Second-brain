// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { isNewerVersion } from './catalog'

describe('isNewerVersion', () => {
  it('compares numeric dot-separated versions', () => {
    expect(isNewerVersion('1.1.0', '1.0.9')).toBe(true)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('1.0.10', '1.0.2')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(false)
  })

  it('handles differing lengths and junk gracefully', () => {
    expect(isNewerVersion('1.2', '1.2.0')).toBe(false)
    expect(isNewerVersion('1.2.1', '1.2')).toBe(true)
    expect(isNewerVersion('v', '')).toBe(false)
  })
})
