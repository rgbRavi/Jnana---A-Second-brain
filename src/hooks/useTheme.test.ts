// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }))

import { renderHook, act } from '@testing-library/react'
import { useTheme } from './useTheme'
import { getToasts } from '../lib/toast'

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

describe('switchThemeWithUndo', () => {
  const custom = (accent: string) => ({ tokens: { '--accent': accent } })
  const last = () => (() => { const t = getToasts(); return t[t.length - 1] })()

  it('offers Undo only when unsaved custom work is discarded', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.pickPreset('dark'))
    act(() => void result.current.importTheme(custom('#123456')))
    act(() => result.current.pickPreset('light'))
    expect(last().action?.label).toBe('Undo')
    act(() => last().action!.onClick())
    expect(result.current.theme.tokens['--accent']).toBe('#123456')

    // preset -> preset: no new toast
    act(() => result.current.pickPreset('dark'))
    const n = getToasts().length
    act(() => result.current.pickPreset('light'))
    expect(getToasts().length).toBe(n)
  })

  it('skips Undo when the theme changed since', () => {
    const { result } = renderHook(() => useTheme())
    act(() => void result.current.importTheme(custom('#abcdef')))
    act(() => result.current.pickPreset('dark'))
    const u = last()
    act(() => result.current.setToken('--accent', '#111111'))
    act(() => u.action!.onClick())
    expect(result.current.theme.tokens['--accent']).toBe('#111111')
  })
})
