// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Soft re-offer of an unfinished onboarding, shown on launches 2 and 3 only
// (see core/onboarding/gate). Not a toast — a toast self-dismisses, and this
// needs to stay put for the boot.

import { X } from 'lucide-react'
import { decideGate } from '../../core/onboarding/gate'
import { dismissNudge, openOnboarding, useOnboardingState } from '../../hooks/useOnboarding'
import styles from './Onboarding.module.css'

export function OnboardingNudge() {
  const state = useOnboardingState()
  if (decideGate(state) !== 'nudge') return null

  return (
    <div className={styles.nudge} role="status">
      <span>New to Jnana? The two-minute tour covers capture, links and where things live.</span>
      <div className={styles.nudgeActions}>
        <button type="button" className={styles.secondaryBtn} onClick={openOnboarding}>
          Take the tour
        </button>
        <button
          type="button"
          className={styles.nudgeDismiss}
          aria-label="Dismiss"
          onClick={dismissNudge}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
