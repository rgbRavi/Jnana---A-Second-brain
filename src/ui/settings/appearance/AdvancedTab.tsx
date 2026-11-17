// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { TOKEN_GROUPS } from '../../../core/themes/tokens'
import { auditContrast } from '../../../core/themes/apply'
import type { ThemeTokens } from '../../../types'
import type { UseThemeApi } from '../../../hooks/useTheme'
import { ColorField, SliderField } from './controls'
import { SettingSection } from '../SettingLayout'
import styles from './Appearance.module.css'

export function AdvancedTab({ api }: { api: UseThemeApi }) {
  const { theme, setToken } = api
  const pairs = auditContrast(theme)
  const failing = pairs.filter((p) => !p.grade.ok).length

  return (
    <div className={styles.tabPane}>
      <SettingSection
        title="Readability check"
        intro="Checks that text stays easy to read against its background (WCAG contrast ratios)."
      >
        <span role="status" className={failing === 0 ? styles.contrastOk : styles.contrastFail}>
          {failing === 0 ? 'All pass' : `${failing} failing`}
        </span>
        <ul className={styles.contrastList}>
          {pairs.map((p) => (
            <li key={p.label} className={styles.contrastRow}>
              <span className={styles.contrastLabel}>{p.label}</span>
              <span className={styles.contrastRatio}>{p.ratio.toFixed(2)}:1</span>
              <span className={`${styles.gradeBadge} ${p.grade.ok ? styles.gradeOk : styles.gradeFail}`}>
                {p.grade.tag}
              </span>
            </li>
          ))}
        </ul>
      </SettingSection>

      <SettingSection title="All colour values" intro="Every theme colour and size, for fine-tuning. Changes apply live.">
        <div className={styles.rawGroups}>
        {TOKEN_GROUPS.filter((g) => g.id !== 'motion').map((g) => (
          <div key={g.id} className={styles.rawGroup}>
            <p className={styles.rawGroupLabel}>{g.label}</p>
            {g.tokens.map((t) => {
              const k = t.k as keyof ThemeTokens
              return t.kind === 'color' ? (
                <ColorField key={t.k} label={t.label} value={theme.tokens[k]} onChange={(v) => setToken(k, v)} />
              ) : (
                <SliderField
                  key={t.k}
                  label={t.label}
                  value={parseInt(theme.tokens[k], 10) || 0}
                  min={t.min ?? 0}
                  max={t.max ?? 100}
                  suffix="px"
                  onChange={(v) => setToken(k, `${v}px`)}
                />
              )
            })}
          </div>
        ))}
        </div>
      </SettingSection>
    </div>
  )
}
