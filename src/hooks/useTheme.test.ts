// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }))

import { renderHook, act } from '@testing-library/react'
import { useTheme } from './useTheme'

describe('useTheme import', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
  })

  it('refuses a non-theme and leaves the current theme untouched', () => {
    const { result } = renderHook(() => useTheme())
    const before = result.current.theme
    let ok = true
    act(() => {
      ok = result.current.importTheme('{"tokens":{"display":"none"}}') && result.current.importTheme('nope')
    })
    expect(ok).toBe(false)
    expect(document.documentElement.style.display).toBe('')
    act(() => void result.current.importTheme({ tokens: { '--accent': 5 } }))
    // bad value dropped, state still a fully valid theme
    expect(typeof result.current.theme.tokens['--accent']).toBe('string')
    expect(result.current.theme.tokens['--accent']).toBe(before.tokens['--accent'])
  })
})
