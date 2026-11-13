// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import {
  activePreset,
  deleteAiPreset,
  isModified,
  renameAiPreset,
  saveAiPreset,
  updateAiPreset,
} from '../../core/ai/presets'
import { showConfirmDialog, showPromptDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import type { AiConfig, AiSection } from '../../types'
import { SettingSelect } from '../settings/SettingControls'
import { switchPreset } from './switchPreset'
import styles from './Ai.module.css'

interface Props {
  section: AiSection
  config: AiConfig
  onReindex?: () => void
}

const SECTION_LABEL: Record<AiSection, string> = {
  chat: 'Chat', embedding: 'Embedding', transcription: 'Transcription', deepResearch: 'Deep research', webSearch: 'Web search',
}

/** Saved setups for one AI section: switch, save, update, rename, delete. */
export function PresetBar({ section, config, onReindex }: Props) {
  const [busy, setBusy] = useState(false)
  const active = activePreset(config, section)
  const modified = isModified(config, section)
  const usesKey = section === 'webSearch' ? active?.provider !== 'searxng' : active?.provider === 'openai'

  // The select and buttons are disabled while a command is pending so a stale save can't undo it.
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const options = [
    { value: '', label: '(none)' },
    ...(config.presets?.[section] ?? []).map((p) => ({
      value: p.id,
      label: p.id === active?.id && modified ? `${p.name} (modified)` : p.name,
    })),
  ]

  return (
    <div className={styles.presetBar}>
      <div className={styles.presetSelect}>
        <SettingSelect
          ariaLabel={`${SECTION_LABEL[section]} preset`}
          disabled={busy}
          value={active?.id ?? ''}
          options={options}
          onChange={(id) => id && id !== active?.id && run(() => switchPreset(section, id, config, { onReindex }))}
        />
      </div>
      <button
        className={styles.btn}
        disabled={busy}
        onClick={() =>
          run(async () => {
            const name = (await showPromptDialog({ title: 'Save preset', placeholder: 'Preset name', confirmLabel: 'Save' }))?.trim()
            if (name) await saveAiPreset(section, name)
          })
        }
      >
        Save as…
      </button>
      <button className={styles.btn} disabled={busy || !active} onClick={() => run(() => updateAiPreset(section, active!.id))}>
        Update
      </button>
      <button
        className={styles.btn}
        disabled={busy || !active}
        onClick={() =>
          run(async () => {
            const name = (
              await showPromptDialog({ title: 'Rename preset', defaultValue: active!.name, confirmLabel: 'Rename' })
            )?.trim()
            if (name && name !== active!.name) await renameAiPreset(section, active!.id, name)
          })
        }
      >
        Rename
      </button>
      <button
        className={styles.btn}
        disabled={busy || !active}
        onClick={() =>
          run(async () => {
            const ok = await showConfirmDialog({
              title: 'Delete preset',
              message: `Delete "${active!.name}"? Your current settings stay as they are.`,
              confirmLabel: 'Delete',
              danger: true,
            })
            if (ok) await deleteAiPreset(section, active!.id)
          })
        }
      >
        Delete
      </button>
      {active && usesKey && !active.hasApiKey && <span className={styles.statsLine}>no key saved</span>}
    </div>
  )
}
