// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// First-run onboarding state. Module-level store backed by localStorage, read
// reactively via useSyncExternalStore — same pattern as useGeneralSettings.
//
// Deliberately NOT in SQLite: this describes the install, not the vault, so it
// must not ride backup/restore (a restore onto a new machine is a new install
// and may well want the tour again).

import { useSyncExternalStore } from 'react'
import type { OnboardingState } from '../core/onboarding/gate'

export const ONBOARDING_KEY = 'jnana.onboarding.v1'

const DEFAULTS: OnboardingState = {
  status: 'pending',
  role: null,
  comfort: null,
  launchCount: 0,
  nudgeDismissedLaunch: null,
  forceOnLaunch: false,
}

function load(): OnboardingState {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<OnboardingState>) }
  } catch {
    return DEFAULTS
  }
}

let state: OnboardingState = load()
// Whether the wizard is on screen. In-memory only: "Replay" must be able to
// open it even when the launch gate says none, and an open wizard should not
// survive a restart.
let open = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function persist() {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
}

export function setOnboarding(patch: Partial<OnboardingState>): void {
  state = { ...state, ...patch }
  persist()
  emit()
}

export function getOnboardingState(): OnboardingState {
  return state
}

// StrictMode double-invokes effects in dev, so an unguarded increment would
// count every dev launch twice and skip the user straight past the wizard.
let counted = false

/** Count this boot. No-ops after the first call in a process. */
export function markLaunch(): void {
  if (counted) return
  counted = true
  setOnboarding({ launchCount: state.launchCount + 1 })
}

export function openOnboarding(): void {
  if (open) return
  open = true
  emit()
}

export function closeOnboarding(): void {
  if (!open) return
  open = false
  emit()
}

export function completeOnboarding(): void {
  setOnboarding({ status: 'done' })
  closeOnboarding()
}

export function skipOnboarding(): void {
  setOnboarding({ status: 'skipped' })
  closeOnboarding()
}

/** Reopen the wizard, keeping the answers already given. */
export function replayOnboarding(): void {
  setOnboarding({ status: 'pending' })
  openOnboarding()
}

/**
 * Wipe the answers and simulate a first run (launchCount 1). `forceOnLaunch` is
 * deliberately preserved — it is the dev switch sitting next to this button.
 */
export function startFreshOnboarding(): void {
  setOnboarding({ ...DEFAULTS, launchCount: 1, forceOnLaunch: state.forceOnLaunch })
  openOnboarding()
}

export function dismissNudge(): void {
  setOnboarding({ nudgeDismissedLaunch: state.launchCount })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useOnboardingState(): OnboardingState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
}

export function useOnboardingOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => open,
  )
}
