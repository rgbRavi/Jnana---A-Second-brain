// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useId, useState } from 'react'
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
import { log } from '../../lib/logger'
import type { AiConfig, AiSection } from '../../types'
import { SettingSelect } from '../settings/SettingControls'
import { switchPreset } from './switchPreset'
import { SettingButton, SettingField } from '../settings/SettingLayout'
import styles from './AiSettings.module.css'

interface Props {
  section: AiSection
  config: AiConfig
  onReindex?: () => void
}

export const MAX_SETUP_NAME = 60

/** Returns the trimmed name to use, or null (after telling the user why) to abort. `raw` null = dialog cancelled. */
export async function checkSetupName(raw: string | null, others: string[]): Promise<string | null> {
  if (raw === null) return null
  const name = raw.trim()
  if (!name) {
    toast.error('Give the setup a name.')
    return null
  }
  if (name.length > MAX_SETUP_NAME) {
    toast.error(`Names can be up to ${MAX_SETUP_NAME} characters.`)
    return null
  }
  if (others.some((o) => o.toLowerCase() === name.toLowerCase())) {
    const ok = await showConfirmDialog({
      title: 'Name already used',
      message: `You already have a setup called "${name}". Use the same name anyway?`,
      confirmLabel: 'Use it anyway',
    })
    if (!ok) return null
  }
  return name
}

const SECTION_LABEL: Record<AiSection, string> = {
  chat: 'Chat', embedding: 'Search by meaning', transcription: 'Transcription', deepResearch: 'Deep research', webSearch: 'Web search',
}

/** Saved setups for one AI section: switch, save, update, rename, delete. */
export function PresetBar({ section, config, onReindex }: Props) {
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const selectId = useId()
  const active = activePreset(config, section)
  const modified = isModified(config, section)
  const usesKey = section === 'webSearch' ? active?.provider !== 'searxng' : active?.provider === 'openai'

  // The select and buttons are disabled while a command is pending so a stale save can't undo it.
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      log.error('[ai] saved setup action failed', e)
      toast.error("Couldn't update your saved setups. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const options = [
    { value: '', label: 'None (current settings)' },
    ...(config.presets?.[section] ?? []).map((p) => ({
      value: p.id,
      label: p.id === active?.id && modified ? `${p.name} (modified)` : p.name,
    })),
  ]

  return (
    <>
      <SettingField label="Saved setup" htmlFor={selectId}>
        <SettingSelect
          id={selectId}
          ariaLabel={`${SECTION_LABEL[section]} saved setup`}
          disabled={busy}
          value={active?.id ?? ''}
          options={options}
          onChange={(id) => id && id !== active?.id && run(() => switchPreset(section, id, config, { onReindex }))}
        />
      <div className={styles.presetBar}>
      <SettingButton
        disabled={busy}
        onClick={() =>
          run(async () => {
            const name = await checkSetupName(
              await showPromptDialog({ title: 'Save these settings as a setup', placeholder: 'Setup name, e.g. Local Llama', confirmLabel: 'Save setup' }),
              (config.presets?.[section] ?? []).map((p) => p.name),
            )
            if (name) await saveAiPreset(section, name)
          })
        }
      >
        Save as…
      </SettingButton>
      {active && (
        <SettingButton aria-expanded={more} onClick={() => setMore((v) => !v)} title="Update, rename or delete this saved setup">
          {more ? 'Less' : 'Manage'}
        </SettingButton>
      )}
      {active && more && (
        <>
      <SettingButton disabled={busy} onClick={() => run(() => updateAiPreset(section, active.id))}>
        Update with current settings
      </SettingButton>
      <SettingButton
        disabled={busy}
        onClick={() =>
          run(async () => {
            const name = await checkSetupName(
              await showPromptDialog({ title: 'Rename saved setup', defaultValue: active!.name, confirmLabel: 'Rename' }),
              (config.presets?.[section] ?? []).filter((p) => p.id !== active!.id).map((p) => p.name),
            )
            if (name && name !== active!.name) await renameAiPreset(section, active!.id, name)
          })
        }
      >
        Rename
      </SettingButton>
      <SettingButton
        variant="danger"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const ok = await showConfirmDialog({
              title: 'Delete saved setup',
              message: `Delete "${active!.name}"? Your current settings stay as they are.`,
              confirmLabel: 'Delete setup',
              danger: true,
            })
            if (ok) await deleteAiPreset(section, active!.id)
          })
        }
      >
        Delete
      </SettingButton>
        </>
      )}
      {active && usesKey && !active.hasApiKey && <span className={styles.statusLine}>This setup has no API key saved.</span>}
      </div>
      </SettingField>
    </>
  )
}
