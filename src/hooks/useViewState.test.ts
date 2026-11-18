// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { clearViewState, usePersistentViewState } from './useViewState'

describe('usePersistentViewState', () => {
  beforeEach(() => {
    localStorage.clear()
    clearViewState()
  })

  it('survives an app reload (in-memory store cleared)', () => {
    const first = renderHook(() => usePersistentViewState('graph.groups', [] as string[]))
    act(() => first.result.current[1](['#physics']))
    first.unmount()

    clearViewState() // what a full reload does to the in-memory store
    const second = renderHook(() => usePersistentViewState('graph.groups', [] as string[]))
    expect(second.result.current[0]).toEqual(['#physics'])
  })

  it('falls back to the default when storage holds bad JSON', () => {
    localStorage.setItem('jnana.view.graph.groups', '{oops')
    const { result } = renderHook(() => usePersistentViewState('graph.groups', ['default']))
    expect(result.current[0]).toEqual(['default'])
  })
})
