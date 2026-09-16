// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ONBOARDING_KEY,
  completeOnboarding,
  dismissNudge,
  getOnboardingState,
  markLaunch,
  setOnboarding,
  skipOnboarding,
  startFreshOnboarding,
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
