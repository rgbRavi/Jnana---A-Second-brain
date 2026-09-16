// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure deck builder for first-run onboarding. Comfort sets DEPTH (a confident
// user gets more cards, not fewer); role filters which optional cards appear.
// No IO — the store and the overlay layer on top of this.

export type OnboardingRole = 'student' | 'researcher' | 'professional' | 'personal' | 'exploring'
export type OnboardingComfort = 'new' | 'some' | 'power'

export type StepId =
  | 'welcome'
  | 'role'
  | 'comfort'
  | 'capture'
  | 'links'
  | 'organize'
  | 'study-kit'
  | 'research-kit'
  | 'ai'
  | 'import'
  | 'power-tools'
  | 'finish'

export const ROLES: OnboardingRole[] = ['student', 'researcher', 'professional', 'personal', 'exploring']
export const COMFORTS: OnboardingComfort[] = ['new', 'some', 'power']

interface StepDef {
  id: StepId
  /** Lowest comfort at which this card appears. */
  minComfort: OnboardingComfort
  /** Roles this card is for; omitted = every role. */
  roles?: OnboardingRole[]
}

const COMFORT_RANK: Record<OnboardingComfort, number> = { new: 0, some: 1, power: 2 }

// Canonical order. selectSteps only ever FILTERS this list, never reorders it,
// so every deck is ordered and duplicate-free by construction.
const STEPS: StepDef[] = [
  { id: 'welcome', minComfort: 'new' },
  { id: 'role', minComfort: 'new' },
  { id: 'comfort', minComfort: 'new' },
  { id: 'capture', minComfort: 'new' },
  { id: 'links', minComfort: 'new' },
  { id: 'organize', minComfort: 'some' },
  { id: 'study-kit', minComfort: 'some', roles: ['student'] },
  { id: 'research-kit', minComfort: 'some', roles: ['researcher'] },
  { id: 'ai', minComfort: 'some' },
  { id: 'import', minComfort: 'some' },
  { id: 'power-tools', minComfort: 'power' },
  { id: 'finish', minComfort: 'new' },
]

/**
 * The cards to show for these answers. Before either question is answered
 * (role/comfort still null) this yields the beginner deck, so the overlay
 * always has something valid to render on its first frame.
 */
export function selectSteps(
  role: OnboardingRole | null,
  comfort: OnboardingComfort | null,
): StepId[] {
  const rank = COMFORT_RANK[comfort ?? 'new']
  return STEPS.filter((s) => {
    if (COMFORT_RANK[s.minComfort] > rank) return false
    if (s.roles && (role === null || !s.roles.includes(role))) return false
    return true
  }).map((s) => s.id)
}
