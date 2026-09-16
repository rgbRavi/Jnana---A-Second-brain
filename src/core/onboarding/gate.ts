// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure launch gate: given the persisted onboarding state, what (if anything)
// should this boot show? Kept separate from the store so it is trivially
// testable as a table.

import type { OnboardingComfort, OnboardingRole } from './steps'

export type OnboardingStatus = 'pending' | 'done' | 'skipped'
export type OnboardingGate = 'wizard' | 'nudge' | 'none'

export interface OnboardingState {
  status: OnboardingStatus
  role: OnboardingRole | null
  comfort: OnboardingComfort | null
  /** Boots since install. Incremented exactly once per process. */
  launchCount: number
  /** launchCount at which the nudge banner was dismissed; null = never. */
  nudgeDismissedLaunch: number | null
  /** Dev switch: force the wizard open on every launch. */
  forceOnLaunch: boolean
}

/** Launches on which an unfinished onboarding is softly re-offered. */
export const NUDGE_LAUNCHES = [2, 3]

export function decideGate(s: OnboardingState): OnboardingGate {
  if (s.forceOnLaunch) return 'wizard'
  if (s.status === 'done') return 'none'
  if (s.status === 'pending' && s.launchCount <= 1) return 'wizard'
  if (NUDGE_LAUNCHES.includes(s.launchCount) && s.nudgeDismissedLaunch !== s.launchCount) {
    return 'nudge'
  }
  return 'none'
}
