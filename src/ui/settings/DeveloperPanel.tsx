// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Developer utilities. Currently onboarding controls only: the first-run wizard
// is otherwise unreachable after launch 3, which makes it impossible to test
// without wiping app data.

import { SettingToggle } from './SettingControls'
import {
  replayOnboarding,
  setOnboarding,
  startFreshOnboarding,
  useOnboardingState,
} from '../../hooks/useOnboarding'
import styles from './DeveloperPanel.module.css'

export function DeveloperPanel() {
  const state = useOnboardingState()

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Tools for testing Jnana itself. The first-run tour normally shows once, so this is the only
        way back into it.
      </p>

      <div className={styles.field}>
        <SettingToggle
          checked={state.forceOnLaunch}
          onChange={(v) => setOnboarding({ forceOnLaunch: v })}
          label="Always show onboarding on launch"
          hint="test switch; overrides the normal first-run-only rule"
        />
      </div>

      <div className={styles.field}>
        <div className={styles.buttons}>
          <button type="button" className={styles.button} onClick={replayOnboarding}>
            Replay onboarding
          </button>
          <button type="button" className={styles.button} onClick={startFreshOnboarding}>
            Start fresh onboarding
          </button>
        </div>
        <p className={styles.hint}>
          Replay keeps your answers. Start fresh clears them and simulates a first launch.
        </p>
      </div>

      <dl className={styles.readout}>
        <dt>status</dt>
        <dd>{state.status}</dd>
        <dt>launches</dt>
        <dd>{state.launchCount}</dd>
        <dt>role</dt>
        <dd>{state.role ?? '—'}</dd>
        <dt>comfort</dt>
        <dd>{state.comfort ?? '—'}</dd>
      </dl>
    </div>
  )
}
