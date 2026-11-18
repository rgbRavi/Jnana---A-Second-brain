// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, useSyncExternalStore } from 'react'
import { EASES } from '../../../core/themes/tokens'
import type { UseThemeApi } from '../../../hooks/useTheme'
import { SliderField, StudioField } from './controls'
import { SettingSelect } from '../SettingControls'
import { getMomentClaims } from '../../../lib/motion/runtime'
import {
  getMomentOwners,
  momentLabel,
  pickOwner,
  setMomentOwner,
  subscribeMoments,
} from '../../../lib/motion/moments'
import { pluginRegistry } from '../../../lib/pluginRegistry'
import { SettingButton, SettingSection } from '../SettingLayout'
import styles from './Appearance.module.css'

const AUTO = '__auto'
const NONE = 'none'

/** One picker per app moment a motion plugin has claimed: which plugin plays it
 *  when more than one wants to. Empty until some plugin claims something. */
function MotionOwners() {
  const claims = useSyncExternalStore(subscribeMoments, getMomentClaims)
  const owners = useSyncExternalStore(subscribeMoments, getMomentOwners)
  if (claims.length === 0) return null
  const nameOf = (id: string) => pluginRegistry.getAll().find((p) => p.id === id)?.name ?? id

  return (
    <SettingSection
      title="Who animates what"
      intro="One animation plays per action. Automatic prefers an installed plugin over Jnana’s own."
    >
      {claims.map(({ moment, claimants }) => {
        const auto = pickOwner(claimants, undefined)
        const choice = owners[moment]
        const id = `motion-owner-${moment}`
        return (
          <StudioField key={moment} label={momentLabel(moment)} htmlFor={id}>
            <SettingSelect
              id={id}
              ariaLabel={`Animation for ${momentLabel(moment)}`}
              value={choice ?? AUTO}
              options={[
                { value: AUTO, label: `Automatic${auto ? ` (${nameOf(auto)})` : ''}` },
                ...claimants.map((c) => ({ value: c.pluginId, label: nameOf(c.pluginId) })),
                { value: NONE, label: 'None' },
              ]}
              onChange={(v) => setMomentOwner(moment, v === AUTO ? undefined : v)}
            />
          </StudioField>
        )
      })}
    </SettingSection>
  )
}

export function MotionTab({ api }: { api: UseThemeApi }) {
  const { theme, setToken } = api
  const [demoOn, setDemoOn] = useState(false)

  const scale = parseFloat(theme.tokens['--motion-scale']) || 1
  const fast = parseInt(theme.tokens['--motion-duration-fast'], 10) || 120
  const base = parseInt(theme.tokens['--motion-duration-base'], 10) || 220
  const slow = parseInt(theme.tokens['--motion-duration-slow'], 10) || 420

  return (
    <div className={styles.tabPane}>
      <SettingSection
        title="Speed"
        intro="Controls how fast animations run app-wide. Your OS's “reduce motion” setting still overrides these (forcing everything instant). Use the Feel demo at the bottom to preview a change."
      >
      <SliderField
        label="Animation length"
        value={scale}
        min={0}
        max={2}
        step={0.05}
        suffix="×"
        hint="0× turns animations off, 1× as set below, 2× makes them take twice as long."
        onChange={(v) => setToken('--motion-scale', String(v))}
      />
      <SliderField
        label="Small motions"
        value={fast}
        min={0}
        max={400}
        suffix="ms"
        hint="Small, frequent motions: hovers, toggles, tooltips, focus rings."
        onChange={(v) => setToken('--motion-duration-fast', `${v}ms`)}
      />
      <SliderField
        label="Standard motions"
        value={base}
        min={0}
        max={700}
        suffix="ms"
        hint="The default speed: menus, dropdowns, panels sliding in."
        onChange={(v) => setToken('--motion-duration-base', `${v}ms`)}
      />
      <SliderField
        label="Large motions"
        value={slow}
        min={0}
        max={1200}
        suffix="ms"
        hint="Large movements: modals, full-view and page transitions."
        onChange={(v) => setToken('--motion-duration-slow', `${v}ms`)}
      />

      <StudioField
        label="Easing"
        htmlFor="motion-ease"
        hint="Acceleration curve every animation follows — how it speeds up and slows down. A few playful springs (e.g. the composer pill) keep their own bounce."
      >
        <SettingSelect
          id="motion-ease"
          ariaLabel="Easing"
          value={theme.tokens['--motion-ease']}
          options={EASES.map((e) => ({ value: e.id, label: e.label }))}
          onChange={(v) => setToken('--motion-ease', v)}
        />
      </StudioField>
      </SettingSection>

      <MotionOwners />

      <SettingSection title="Feel demo">
        <StudioField label="Preview" htmlFor="motion-demo">
          {/* id on a wrapper, not the button, so the label doesn't rename it */}
          <div id="motion-demo">
            <SettingButton onClick={() => setDemoOn((v) => !v)}>
              {demoOn ? 'Play in reverse' : 'Play'}
            </SettingButton>
          </div>
        </StudioField>
        <div className={styles.motionDemoLane}>
          <div className={`${styles.motionDemoBox} ${demoOn ? styles.motionDemoBoxOn : ''}`} />
        </div>
      </SettingSection>
    </div>
  )
}
