// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useAdvancedAiSettings, setAdvancedAiSettings } from '../../hooks/useAdvancedAiSettings'
import { getRuleEvents, clearRuleEvents } from '../../core/ai/ruleMetrics'
import { SettingSelect, SettingSlider, SettingToggle, type SelectOption } from './SettingControls'
import { toast } from '../../lib/toast'
import styles from './ComposerSettingsPanel.module.css'

const REFRESH_OPTIONS: SelectOption[] = [
  { value: 'off', label: 'Off (inject once at the top)' },
  { value: 'always-tail', label: 'Always refresh near the newest message' },
  { value: 'counters', label: 'Refresh on turn / token thresholds' },
  { value: 'counters-drift', label: 'Counters + drift (experimental — falls back to counters)' },
  { value: 'counters-violation', label: 'Counters + violation (experimental — falls back to counters)' },
]

const SELECTION_OPTIONS: SelectOption[] = [
  { value: 'all-enabled', label: 'Include all enabled rules' },
  { value: 'rag-topK', label: 'Retrieve most relevant (experimental — falls back to all)' },
]

const DRIFT_MODE_OPTIONS: SelectOption[] = [
  { value: 'topic-shift', label: 'Topic shift (recommended)' },
  { value: 'rule-content', label: 'Rule-vs-content (spec-literal, noisy)' },
]

/** Settings → Advanced AI generation: rule refresh/selection strategy knobs + metrics export. */
export function AdvancedAiPanel() {
  const cfg = useAdvancedAiSettings()

  const exportMetrics = () => {
    const data = JSON.stringify(getRuleEvents(), null, 2)
    void navigator.clipboard?.writeText(data).then(
      () => toast.success('Rule metrics copied to clipboard'),
      () => toast.error('Could not copy metrics to clipboard'),
    )
  }

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Controls how your Rules are re-injected to keep long chats on-instruction. Experimental options
        are marked and fall back to the safe default until built.
      </p>

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label htmlFor="advai-refresh-strategy">Rule refresh strategy</label>
        </div>
        <SettingSelect
          id="advai-refresh-strategy"
          value={cfg.refreshStrategy}
          options={REFRESH_OPTIONS}
          onChange={(v) => setAdvancedAiSettings({ refreshStrategy: v as typeof cfg.refreshStrategy })}
        />
      </div>

      {cfg.refreshStrategy.startsWith('counters') && (
        <>
          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <label htmlFor="advai-every-n-turns">Refresh every N turns</label>
              <span className={styles.value}>{cfg.everyNTurns}</span>
            </div>
            <SettingSlider
              id="advai-every-n-turns"
              min={1}
              max={20}
              step={1}
              value={cfg.everyNTurns}
              ariaLabel="Refresh every N turns"
              onChange={(everyNTurns) => setAdvancedAiSettings({ everyNTurns })}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <label htmlFor="advai-token-threshold">…or when history exceeds (tokens)</label>
              <span className={styles.value}>{cfg.tokenThreshold}</span>
            </div>
            <SettingSlider
              id="advai-token-threshold"
              min={500}
              max={20000}
              step={500}
              value={cfg.tokenThreshold}
              ariaLabel="Refresh when history exceeds this many tokens"
              onChange={(tokenThreshold) => setAdvancedAiSettings({ tokenThreshold })}
            />
          </div>
        </>
      )}

      {cfg.refreshStrategy === 'counters-drift' && (
        <>
          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <label htmlFor="advai-drift-mode">Drift detection mode</label>
            </div>
            <SettingSelect
              id="advai-drift-mode"
              value={cfg.driftMode}
              options={DRIFT_MODE_OPTIONS}
              onChange={(v) => setAdvancedAiSettings({ driftMode: v as typeof cfg.driftMode })}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <label htmlFor="advai-drift-threshold">Drift threshold</label>
              <span className={styles.value}>{cfg.driftThreshold}</span>
            </div>
            <SettingSlider
              id="advai-drift-threshold"
              min={0.1}
              max={0.95}
              step={0.05}
              value={cfg.driftThreshold}
              ariaLabel="Drift threshold"
              onChange={(driftThreshold) => setAdvancedAiSettings({ driftThreshold })}
            />
          </div>
        </>
      )}

      {cfg.refreshStrategy === 'counters-violation' && (
        <>
          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <label htmlFor="advai-violation-every-n-turns">Check for violations every N turns</label>
              <span className={styles.value}>{cfg.violationEveryNTurns}</span>
            </div>
            <SettingSlider
              id="advai-violation-every-n-turns"
              min={1}
              max={10}
              step={1}
              value={cfg.violationEveryNTurns}
              ariaLabel="Check for violations every N turns"
              onChange={(violationEveryNTurns) => setAdvancedAiSettings({ violationEveryNTurns })}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <label htmlFor="advai-violation-model">Violation-check model</label>
            </div>
            <input
              id="advai-violation-model"
              type="text"
              className={styles.textInput}
              value={cfg.violationModel}
              placeholder="Blank = use the chat model"
              onChange={(e) => setAdvancedAiSettings({ violationModel: e.target.value })}
            />
          </div>
        </>
      )}

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label htmlFor="advai-selection">Rule selection</label>
        </div>
        <SettingSelect
          id="advai-selection"
          value={cfg.selection}
          options={SELECTION_OPTIONS}
          onChange={(v) => setAdvancedAiSettings({ selection: v as typeof cfg.selection })}
        />
      </div>

      {cfg.selection === 'rag-topK' && (
        <div className={styles.field}>
          <div className={styles.fieldHead}>
            <label htmlFor="advai-rag-topk">Top-K rules</label>
            <span className={styles.value}>{cfg.ragTopK}</span>
          </div>
          <SettingSlider
            id="advai-rag-topk"
            min={1}
            max={20}
            step={1}
            value={cfg.ragTopK}
            ariaLabel="Top-K rules"
            onChange={(ragTopK) => setAdvancedAiSettings({ ragTopK })}
          />
        </div>
      )}

      <SettingToggle
        checked={cfg.logMetrics}
        onChange={(logMetrics) => setAdvancedAiSettings({ logMetrics })}
        label="Log strategy metrics (local)"
        hint="record per-turn rule events for A/B testing"
        ariaLabel="Log strategy metrics"
      />

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label>Metrics</label>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={exportMetrics}>
            Copy metrics JSON
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              clearRuleEvents()
              toast.success('Metrics cleared')
            }}
          >
            Clear metrics
          </button>
        </div>
        <span className={styles.hint}>Copies the local rule-injection event log for A/B comparison.</span>
      </div>
    </div>
  )
}
