// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ONBOARDING_KEY,
  closeOnboarding,
  completeOnboarding,
  dismissNudge,
  getOnboardingState,
  markLaunch,
  openOnboarding,
  replayOnboarding,
  setOnboarding,
  skipOnboarding,
  startFreshOnboarding,
  useOnboardingOpen,
  useOnboardingState,
} from './useOnboarding'

describe('useOnboarding store', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset to a known baseline; markLaunch's once-per-process guard is
    // exercised in its own test below.
    setOnboarding({
      status: 'pending',
      role: null,
      comfort: null,
      launchCount: 0,
      nudgeDismissedLaunch: null,
      forceOnLaunch: false,
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('starts pending with no answers', () => {
    const s = getOnboardingState()
    expect(s.status).toBe('pending')
    expect(s.role).toBeNull()
    expect(s.comfort).toBeNull()
    expect(s.forceOnLaunch).toBe(false)
  })

  it('persists a patch under the versioned key', () => {
    setOnboarding({ role: 'student', comfort: 'power' })
    expect(getOnboardingState().role).toBe('student')
    expect(localStorage.getItem(ONBOARDING_KEY)).toContain('"role":"student"')
  })

  it('increments the launch count exactly once per process', () => {
    markLaunch()
    markLaunch()
    markLaunch()
    expect(getOnboardingState().launchCount).toBe(1)
  })

  it('treats complete and skip as terminal states', () => {
    completeOnboarding()
    expect(getOnboardingState().status).toBe('done')
    skipOnboarding()
    expect(getOnboardingState().status).toBe('skipped')
  })

  it('records the current launch when the nudge is dismissed', () => {
    setOnboarding({ launchCount: 3 })
    dismissNudge()
    expect(getOnboardingState().nudgeDismissedLaunch).toBe(3)
  })

  it('skipOnboarding also dismisses the nudge for the current launch', () => {
    setOnboarding({ launchCount: 2 })
    skipOnboarding()
    expect(getOnboardingState().status).toBe('skipped')
    expect(getOnboardingState().nudgeDismissedLaunch).toBe(2)
  })

  it('startFresh clears answers and simulates launch 1 but keeps the dev switch', () => {
    setOnboarding({ role: 'researcher', comfort: 'power', status: 'done', forceOnLaunch: true })
    startFreshOnboarding()
    const s = getOnboardingState()
    expect(s.role).toBeNull()
    expect(s.comfort).toBeNull()
    expect(s.status).toBe('pending')
    expect(s.launchCount).toBe(1)
    expect(s.forceOnLaunch).toBe(true)
  })

  it('falls back to defaults when the stored JSON is corrupt', async () => {
    localStorage.setItem(ONBOARDING_KEY, '{ not valid json')
    vi.resetModules()
    const mod = await import('./useOnboarding')
    expect(mod.getOnboardingState().status).toBe('pending')
    expect(mod.getOnboardingState().launchCount).toBe(0)
  })

  it('keeps the in-memory value when persistence throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(() => setOnboarding({ comfort: 'some' })).not.toThrow()
    expect(getOnboardingState().comfort).toBe('some')
  })
})

describe('useOnboarding hooks and open state', () => {
  beforeEach(() => {
    localStorage.clear()
    setOnboarding({
      status: 'pending',
      role: null,
      comfort: null,
      launchCount: 0,
      nudgeDismissedLaunch: null,
      forceOnLaunch: false,
    })
    closeOnboarding()
  })
  afterEach(() => vi.restoreAllMocks())

  it('useOnboardingOpen starts false and toggles on open/close', () => {
    const { result } = renderHook(() => useOnboardingOpen())
    expect(result.current).toBe(false)

    act(() => openOnboarding())
    expect(result.current).toBe(true)

    act(() => closeOnboarding())
    expect(result.current).toBe(false)
  })

  it('replayOnboarding sets status pending, opens the wizard, and preserves answers', () => {
    setOnboarding({ role: 'student', comfort: 'power' })

    const stateHook = renderHook(() => useOnboardingState())
    const openHook = renderHook(() => useOnboardingOpen())

    act(() => replayOnboarding())

    expect(stateHook.result.current.status).toBe('pending')
    expect(stateHook.result.current.role).toBe('student')
    expect(stateHook.result.current.comfort).toBe('power')
    expect(openHook.result.current).toBe(true)
  })

  it('useOnboardingState re-renders on state changes', () => {
    const { result } = renderHook(() => useOnboardingState())
    expect(result.current.comfort).toBeNull()

    act(() => setOnboarding({ comfort: 'some' }))

    expect(result.current.comfort).toBe('some')
  })
})
