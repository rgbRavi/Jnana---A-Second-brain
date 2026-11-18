// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useId, useState } from 'react'
import { useAdvancedAiSettings, setAdvancedAiSettings } from '../../hooks/useAdvancedAiSettings'
import { useGeneralSettings } from '../../hooks/useGeneralSettings'
import type { AiConfig } from '../../types'
import { DraftText } from '../ai/AiSettingsPanel'
import { ToolbarSettings } from '../ai/ToolbarSettings'
import aiStyles from '../ai/AiSettings.module.css'
import { getRuleEvents, clearRuleEvents } from '../../core/ai/ruleMetrics'
import { SettingSelect, SettingSlider, SettingToggle, type SelectOption } from './SettingControls'
import { SettingActionRow, SettingButton, SettingField, SettingPanel, SettingSection, hintId, settingInputClass } from './SettingLayout'
import { toast } from '../../lib/toast'
import { log } from '../../lib/logger'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

/** `experimental` options fall back to the safe default until finished; shown only to developers (or if already selected). */
const REFRESH_OPTIONS: (SelectOption & { experimental?: boolean })[] = [
  { value: 'off', label: 'Once, at the start of the chat' },
  { value: 'always-tail', label: 'Before every message' },
  { value: 'counters', label: 'Every few messages or in long chats' },
  { value: 'counters-drift', label: 'Counters + drift (experimental — falls back to counters)', experimental: true },
  { value: 'counters-violation', label: 'Counters + violation (experimental — falls back to counters)', experimental: true },
]

const SELECTION_OPTIONS: (SelectOption & { experimental?: boolean })[] = [
  { value: 'all-enabled', label: 'All your enabled Rules' },
  { value: 'rag-topK', label: 'Retrieve most relevant (experimental — falls back to all)', experimental: true },
]

/** Token presets for how much note text grounded actions may read. */
const CONTEXT_PRESETS = [4_000, 16_000, 32_000, 64_000, 100_000, 200_000]
const fmtTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n))
const CONTEXT_HINTS: Record<number, string> = {
  4000: 'small local models',
  32000: 'default',
  100000: 'most hosted models',
}

const DRIFT_MODE_OPTIONS: SelectOption[] = [
  { value: 'topic-shift', label: 'Topic shift (recommended)' },
  { value: 'rule-content', label: 'Rule-vs-content (spec-literal, noisy)' },
]

const WEB_CITATION_OPTIONS: SelectOption[] = [
  { value: 'checked', label: 'Checked citations' },
  { value: 'sources', label: 'Sources only' },
]

/** Settings → How the AI answers: chat defaults, web answers, how much of your notes the AI reads, and how Rules are re-injected. */
// Settings owns the one useRag() copy and passes it down (a second copy would
// double-index every saved note while this tab is open).
export function AdvancedAiPanel({ config, updateConfig }: { config: AiConfig; updateConfig: (c: AiConfig) => Promise<boolean> }) {
  const cfg = useAdvancedAiSettings()
  const [{ showDeveloperOptions: dev }] = useGeneralSettings()
  const uid = useId()
  const [contextDraft, setContextDraft] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const isPreset = CONTEXT_PRESETS.includes(cfg.noteContextTokens)
  const showCustom = customOpen || !isPreset
  const contextOptions: SelectOption[] = [
    ...CONTEXT_PRESETS.map((n) => ({
      value: String(n),
      label: `${fmtTokens(n)} tokens${CONTEXT_HINTS[n] ? ` — ${CONTEXT_HINTS[n]}` : ''}`,
    })),
    { value: 'custom', label: 'Custom…' },
  ]
  // Unfinished strategies stay hidden unless developer options are on — but an already-selected one stays visible and working.
  const visible = (o: { value: string; experimental?: boolean }, current: string) => dev || !o.experimental || o.value === current
  const refreshOptions = REFRESH_OPTIONS.filter((o) => visible(o, cfg.refreshStrategy))
  const selectionOptions = SELECTION_OPTIONS.filter((o) => visible(o, cfg.selection))

  const commitContext = () => {
    if (contextDraft === null) return
    const n = Math.round(Number(contextDraft.replace(/[,_\s]/g, '')))
    if (Number.isFinite(n) && n >= 1000) {
      if (n > 2_000_000) toast.info('Capped at 2,000,000 tokens.')
      setAdvancedAiSettings({ noteContextTokens: Math.min(2_000_000, n) })
    }
    else if (contextDraft.trim()) toast.error('Enter at least 1,000 tokens.')
    setContextDraft(null)
  }

  const exportMetrics = async () => {
    try {
      await writeText(JSON.stringify(getRuleEvents(), null, 2))
      toast.success('Rule metrics copied.')
    } catch (e) {
      log.error('[ai] copying rule metrics failed', e)
      toast.error("Couldn't copy the metrics. Try again.")
    }
  }

  const id = (name: string) => `${uid}-${name}`
  return (
    <SettingPanel>
      <SettingSection title="Chat defaults">
        <SettingField
          stacked
          label="Global system prompt"
          htmlFor={id('global-prompt')}
          hint="Added to every chat unless the active chat setup has its own."
        >
          <DraftText
            multiline
            id={id('global-prompt')}
            className={`${settingInputClass} ${aiStyles.textarea}`}
            rows={4}
            aria-describedby={hintId(id('global-prompt'))}
            value={config.globalSystemPrompt}
            onCommit={(v) => void updateConfig({ ...config, globalSystemPrompt: v })}
          />
        </SettingField>
        <ToolbarSettings />
      </SettingSection>

      <SettingSection title="Web answers">
        <SettingField
          label="How sources are shown"
          htmlFor={id('web-citations')}
          hint="Checked citations keeps only the quotes found on the pages the AI read. Sources only lists the pages without checking them."
          hintVisible
        >
          <SettingSelect
            id={id('web-citations')}
            value={cfg.webCitations}
            options={WEB_CITATION_OPTIONS}
            ariaDescribedBy={hintId(id('web-citations'))}
            onChange={(v) => setAdvancedAiSettings({ webCitations: v as typeof cfg.webCitations })}
          />
        </SettingField>
      </SettingSection>

      <SettingSection title="Reading your notes">
        <SettingField
          label="Notes the AI may read (Analyze, Ask, Quiz)"
          htmlFor={id('note-context')}
          hintVisible
          hint="A token is about ¾ of a word. Notes that fit are sent whole; longer ones send their best-matching passages. More is slower and costs more — stay under your model's context window."
        >
          <SettingSelect
            id={id('note-context')}
            value={showCustom ? 'custom' : String(cfg.noteContextTokens)}
            options={contextOptions}
            onChange={(v) => {
              setContextDraft(null)
              if (v === 'custom') setCustomOpen(true)
              else {
                setCustomOpen(false)
                setAdvancedAiSettings({ noteContextTokens: Number(v) })
              }
            }}
          />
          {showCustom && <input
            type="text"
            inputMode="numeric"
            className={settingInputClass}
            placeholder="Token count, e.g. 150000"
            value={contextDraft ?? (isPreset ? '' : String(cfg.noteContextTokens))}
            onChange={(e) => setContextDraft(e.target.value)}
            onBlur={commitContext}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitContext()
            }}
            aria-label="Custom token count"
            aria-describedby={hintId(id('note-context'))}
          />}
        </SettingField>
      </SettingSection>

      <SettingSection
        title="Rules"
        intro="Rules are standing instructions you pick in AI chat (Capabilities → Rules). In long chats the AI can lose track of them, so these settings decide when it is reminded."
      >
        <SettingField label="Remind the AI of your Rules" htmlFor={id('refresh')} hint="How often your Rules are repeated to the AI during a chat." hintVisible>
          <SettingSelect
            id={id('refresh')}
            value={cfg.refreshStrategy}
            options={refreshOptions}
            onChange={(v) => setAdvancedAiSettings({ refreshStrategy: v as typeof cfg.refreshStrategy })}
          />
        </SettingField>

        {cfg.refreshStrategy.startsWith('counters') && (
          <>
            <SettingField label="Every this many messages" htmlFor={id('turns')} value={cfg.everyNTurns}>
              <SettingSlider
                id={id('turns')}
                min={1}
                max={20}
                step={1}
                value={cfg.everyNTurns}
                ariaLabel="Every this many messages"
                onChange={(everyNTurns) => setAdvancedAiSettings({ everyNTurns })}
              />
            </SettingField>

            <SettingField
              label="…or once the chat is longer than (tokens)"
              htmlFor={id('tokens')}
              value={cfg.tokenThreshold}
              hint="Counts everything said so far in the chat. A token is about ¾ of a word."
            >
              <SettingSlider
                id={id('tokens')}
                min={500}
                max={20000}
                step={500}
                value={cfg.tokenThreshold}
                ariaLabel="…or once the chat is longer than (tokens)"
                onChange={(tokenThreshold) => setAdvancedAiSettings({ tokenThreshold })}
              />
            </SettingField>
          </>
        )}

        {cfg.refreshStrategy === 'counters-drift' && (
          <>
            <SettingField
              label="Drift detection mode"
              htmlFor={id('drift-mode')}
              hintVisible
              hint="Drift means the conversation has wandered away from what your Rules were written for."
            >
              <SettingSelect
                id={id('drift-mode')}
                value={cfg.driftMode}
                options={DRIFT_MODE_OPTIONS}
                onChange={(v) => setAdvancedAiSettings({ driftMode: v as typeof cfg.driftMode })}
              />
            </SettingField>

            <SettingField
              label="Drift threshold"
              htmlFor={id('drift-threshold')}
              value={cfg.driftThreshold}
              hint="Higher values refresh the Rules less often; lower values refresh at the first sign of drift."
            >
              <SettingSlider
                id={id('drift-threshold')}
                min={0.1}
                max={0.95}
                step={0.05}
                value={cfg.driftThreshold}
                ariaLabel="Drift threshold"
                onChange={(driftThreshold) => setAdvancedAiSettings({ driftThreshold })}
              />
            </SettingField>
          </>
        )}

        {cfg.refreshStrategy === 'counters-violation' && (
          <>
            <SettingField label="Check for violations every N turns" htmlFor={id('violation-turns')} value={cfg.violationEveryNTurns}>
              <SettingSlider
                id={id('violation-turns')}
                min={1}
                max={10}
                step={1}
                value={cfg.violationEveryNTurns}
                ariaLabel="Check for violations every N turns"
                onChange={(violationEveryNTurns) => setAdvancedAiSettings({ violationEveryNTurns })}
              />
            </SettingField>

            <SettingField label="Violation-check model" htmlFor={id('violation-model')} hint="Leave blank to use your chat model.">
              <input
                id={id('violation-model')}
                type="text"
                className={settingInputClass}
                value={cfg.violationModel}
                aria-describedby={hintId(id('violation-model'))}
                onChange={(e) => setAdvancedAiSettings({ violationModel: e.target.value })}
              />
            </SettingField>
          </>
        )}

        <SettingField label="Which Rules to send" htmlFor={id('selection')} hint="Which of your Rules go with each message." hintVisible>
          <SettingSelect
            id={id('selection')}
            value={cfg.selection}
            options={selectionOptions}
            onChange={(v) => setAdvancedAiSettings({ selection: v as typeof cfg.selection })}
          />
        </SettingField>

        {cfg.selection === 'rag-topK' && (
          <SettingField
            label="How many Rules to send"
            htmlFor={id('topk')}
            hintVisible
            value={cfg.ragTopK}
            hint="Only this many of the most relevant Rules are sent each time."
          >
            <SettingSlider
              id={id('topk')}
              min={1}
              max={20}
              step={1}
              value={cfg.ragTopK}
              ariaLabel="How many Rules to send"
              onChange={(ragTopK) => setAdvancedAiSettings({ ragTopK })}
            />
          </SettingField>
        )}
      </SettingSection>

      {dev && (
        <SettingSection title="Developer: strategy metrics">
          <SettingToggle
            checked={cfg.logMetrics}
            onChange={(logMetrics) => setAdvancedAiSettings({ logMetrics })}
            label="Log strategy metrics (local)"
            hint="record per-turn rule events for A/B testing"
            ariaLabel="Log strategy metrics"
          />
          <SettingActionRow label="Metrics">
            <SettingButton onClick={() => void exportMetrics()}>Copy metrics JSON</SettingButton>
            <SettingButton
              onClick={() => {
                clearRuleEvents()
                toast.success('Metrics cleared.')
              }}
            >
              Clear metrics
            </SettingButton>
          </SettingActionRow>
        </SettingSection>
      )}
    </SettingPanel>
  )
}
