// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import { EASES } from '../../../core/themes/tokens'
import type { UseThemeApi } from '../../../hooks/useTheme'
import { SliderField } from './controls'
import { SettingSelect } from '../SettingControls'
import styles from './Appearance.module.css'

export function MotionTab({ api }: { api: UseThemeApi }) {
  const { theme, setToken } = api
  const [demoOn, setDemoOn] = useState(false)

  const scale = parseFloat(theme.tokens['--motion-scale']) || 1
  const fast = parseInt(theme.tokens['--motion-duration-fast'], 10) || 120
  const base = parseInt(theme.tokens['--motion-duration-base'], 10) || 220
  const slow = parseInt(theme.tokens['--motion-duration-slow'], 10) || 420

  return (
    <div className={styles.tabPane}>
      <p className={styles.hint}>
        Controls how fast animations run app-wide. Your OS's "reduce motion" setting still overrides these
        (forcing everything instant). Use the Feel demo at the bottom to preview a change.
      </p>

      <SliderField
        label="Master scale"
        value={scale}
        min={0}
        max={2}
        step={0.05}
        suffix="×"
        hint="Multiplies all three durations below at once. 1× = as set, 0× = instant, 2× = twice as slow."
        onChange={(v) => setToken('--motion-scale', String(v))}
      />
      <SliderField
        label="Fast"
        value={fast}
        min={0}
        max={400}
        suffix="ms"
        hint="Small, frequent motions: hovers, toggles, tooltips, focus rings."
        onChange={(v) => setToken('--motion-duration-fast', `${v}ms`)}
      />
      <SliderField
        label="Base"
        value={base}
        min={0}
        max={700}
        suffix="ms"
        hint="The default speed: menus, dropdowns, panels sliding in."
        onChange={(v) => setToken('--motion-duration-base', `${v}ms`)}
      />
      <SliderField
        label="Slow"
        value={slow}
        min={0}
        max={1200}
        suffix="ms"
        hint="Large movements: modals, full-view and page transitions."
        onChange={(v) => setToken('--motion-duration-slow', `${v}ms`)}
      />

      <div className={styles.field}>
        <label>Easing</label>
        <SettingSelect
          ariaLabel="Easing"
          value={theme.tokens['--motion-ease']}
          options={EASES.map((e) => ({ value: e.id, label: e.label }))}
          onChange={(v) => setToken('--motion-ease', v)}
        />
        <p className={styles.hint}>Acceleration curve every animation follows — how it speeds up and slows down. A few playful springs (e.g. the composer pill) keep their own bounce.</p>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label>Feel demo</label>
          <button type="button" className={styles.secondaryBtn} onClick={() => setDemoOn((v) => !v)}>
            {demoOn ? 'Reset' : 'Play'}
          </button>
        </div>
        <div className={styles.motionDemoLane}>
          <div className={`${styles.motionDemoBox} ${demoOn ? styles.motionDemoBoxOn : ''}`} />
        </div>
      </div>
    </div>
  )
}
