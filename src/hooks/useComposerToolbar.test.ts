// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { DEFAULT_HIDDEN, DEFAULT_TOOLBAR, sanitizeToolbar, useComposerToolbar } from './useComposerToolbar'

beforeEach(() => {
  const { result } = renderHook(() => useComposerToolbar())
  act(() => result.current[1].reset())
})

describe('useComposerToolbar', () => {
  it('moves, toggles and resets', () => {
    const { result } = renderHook(() => useComposerToolbar())
    act(() => result.current[1].move(0, 2))
    expect(result.current[0].order).toEqual(['attach', 'capabilities', 'preset', 'more', 'focused'])
    act(() => result.current[1].toggle('more'))
    expect(result.current[0].hidden).toEqual(['preset', 'more'])
    act(() => result.current[1].toggle('more'))
    expect(result.current[0].hidden).toEqual(['preset'])
    act(() => result.current[1].toggle('focused'))
    act(() => result.current[1].reset())
    expect(result.current[0]).toEqual({ order: DEFAULT_TOOLBAR, hidden: DEFAULT_HIDDEN })
  })
  it('ignores out-of-range moves', () => {
    const { result } = renderHook(() => useComposerToolbar())
    act(() => result.current[1].move(0, 9))
    expect(result.current[0].order).toEqual(DEFAULT_TOOLBAR)
  })
  it('sanitises corrupt or unknown data to defaults plus missing items', () => {
    expect(sanitizeToolbar('junk')).toEqual({ order: DEFAULT_TOOLBAR, hidden: ['preset'] })
    expect(sanitizeToolbar({ order: [], hidden: [] }).hidden).toEqual([])
    expect(sanitizeToolbar(null).order).toEqual(DEFAULT_TOOLBAR)
    expect(sanitizeToolbar({ order: ['more', 'bogus', 'more', 'attach'], hidden: ['x', 'attach', 'attach'] })).toEqual({
      order: ['more', 'attach', 'preset', 'capabilities', 'focused'],
      hidden: ['attach'],
    })
  })
})
