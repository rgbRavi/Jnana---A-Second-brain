// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import { decideGate, type OnboardingState } from './gate'

const base: OnboardingState = {
  status: 'pending',
  role: null,
  comfort: null,
  launchCount: 1,
  nudgeDismissedLaunch: null,
  forceOnLaunch: false,
}
const s = (patch: Partial<OnboardingState>): OnboardingState => ({ ...base, ...patch })

describe('decideGate', () => {
  it('opens the wizard on the first launch of a fresh install', () => {
    expect(decideGate(s({ launchCount: 1 }))).toBe('wizard')
  })

  it('nudges on launches 2 and 3 when the wizard was never finished', () => {
    expect(decideGate(s({ launchCount: 2 }))).toBe('nudge')
    expect(decideGate(s({ launchCount: 3 }))).toBe('nudge')
  })

  it('nudges a user who skipped, then goes quiet after launch 3', () => {
    expect(decideGate(s({ status: 'skipped', launchCount: 2 }))).toBe('nudge')
    expect(decideGate(s({ status: 'skipped', launchCount: 4 }))).toBe('none')
  })

  it('stays silent forever once completed', () => {
    for (const launchCount of [1, 2, 3, 9]) {
      expect(decideGate(s({ status: 'done', launchCount }))).toBe('none')
    }
  })

  it('suppresses the nudge for the launch it was dismissed on', () => {
    expect(decideGate(s({ launchCount: 2, nudgeDismissedLaunch: 2 }))).toBe('none')
    // ...but it may return on the next launch inside the window
    expect(decideGate(s({ launchCount: 3, nudgeDismissedLaunch: 2 }))).toBe('nudge')
  })

  it('forceOnLaunch overrides every other outcome', () => {
    expect(decideGate(s({ forceOnLaunch: true, status: 'done', launchCount: 50 }))).toBe('wizard')
    expect(decideGate(s({ forceOnLaunch: true, status: 'skipped', launchCount: 2 }))).toBe('wizard')
  })
})
