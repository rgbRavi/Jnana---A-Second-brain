// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Developer utilities: onboarding controls (the first-run wizard is otherwise
// unreachable after launch 3) and the Developer Log viewer.

import { SettingToggle } from './SettingControls'
import { SettingActions, SettingButton, SettingPanel, SettingSection } from './SettingLayout'
import {
  replayOnboarding,
  setOnboarding,
  startFreshOnboarding,
  useOnboardingState,
} from '../../hooks/useOnboarding'
import styles from './DeveloperPanel.module.css'
import { DeveloperLog } from './DeveloperLog'

export function DeveloperPanel() {
  const state = useOnboardingState()

  return (
    <SettingPanel
      intro="Tools for testing Jnana itself. The first-run tour normally shows once, so this is the only way back into it."
    >
      <SettingSection title="Onboarding">
        <SettingToggle
          checked={state.forceOnLaunch}
          onChange={(v) => setOnboarding({ forceOnLaunch: v })}
          label="Always show onboarding on launch"
          hint="test switch; overrides the normal first-run-only rule"
        />
        <SettingActions>
          <SettingButton onClick={replayOnboarding}>Replay onboarding</SettingButton>
          <SettingButton onClick={startFreshOnboarding}>Start fresh onboarding</SettingButton>
        </SettingActions>
        <p className={styles.note}>Replay keeps your answers. Start fresh clears them and simulates a first launch.</p>

        <dl className={styles.readout}>
          <dt>Tour status</dt>
          <dd>{state.status}</dd>
          <dt>Launch count</dt>
          <dd>{state.launchCount}</dd>
          <dt>Role</dt>
          <dd>{state.role ?? '—'}</dd>
          <dt>Comfort level</dt>
          <dd>{state.comfort ?? '—'}</dd>
        </dl>
      </SettingSection>
      <DeveloperLog />
    </SettingPanel>
  )
}
