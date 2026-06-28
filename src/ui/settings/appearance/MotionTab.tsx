import { useState } from 'react'
import { EASES } from '../../../core/themes/tokens'
import type { UseThemeApi } from '../../../hooks/useTheme'
import { SliderField } from './controls'
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
        Tokens apply immediately; wiring real UI animations to them (gated by both your OS's reduced-motion
        setting and an in-app toggle) is a later pass — for now this just sets the variables.
      </p>

      <SliderField
        label="Master scale"
        value={scale}
        min={0}
        max={2}
        step={0.05}
        suffix="×"
        onChange={(v) => setToken('--motion-scale', String(v))}
      />
      <SliderField
        label="Fast"
        value={fast}
        min={0}
        max={400}
        suffix="ms"
        onChange={(v) => setToken('--motion-duration-fast', `${v}ms`)}
      />
      <SliderField
        label="Base"
        value={base}
        min={0}
        max={700}
        suffix="ms"
        onChange={(v) => setToken('--motion-duration-base', `${v}ms`)}
      />
      <SliderField
        label="Slow"
        value={slow}
        min={0}
        max={1200}
        suffix="ms"
        onChange={(v) => setToken('--motion-duration-slow', `${v}ms`)}
      />

      <div className={styles.field}>
        <label>Easing</label>
        <select
          className={styles.select}
          value={theme.tokens['--motion-ease']}
          onChange={(e) => setToken('--motion-ease', e.target.value)}
        >
          {EASES.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
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
