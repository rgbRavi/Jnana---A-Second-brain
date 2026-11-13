// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { applyAiPreset, isModified, updateAiPreset } from '../../core/ai/presets'
import { showChoiceDialog, showConfirmDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import type { AiConfig, AiSection } from '../../types'

/**
 * Switch a section to a saved preset: offer to keep unsaved edits first, and for
 * Embeddings warn that a different model invalidates the search index.
 * Failures surface as a toast; nothing is thrown.
 */
export async function switchPreset(
  section: AiSection,
  id: string,
  config: AiConfig,
  opts: { onReindex?: () => void } = {},
): Promise<void> {
  const target = config.presets?.[section]?.find((p) => p.id === id)
  if (!target) return
  try {
    if (isModified(config, section)) {
      const choice = await showChoiceDialog({
        title: 'Unsaved changes',
        message: 'This setup has changes that are not saved to its preset.',
        options: [
          { value: 'update', label: 'Update preset first', primary: true },
          { value: 'discard', label: 'Discard changes' },
        ],
        cancelLabel: 'Cancel',
      })
      if (choice === null) return
      if (choice === 'update') {
        const active = config.activePresets?.[section]
        if (active) await updateAiPreset(section, active)
      }
    }
    let reindex = false
    if (
      section === 'embedding' &&
      (target.provider !== config.embeddingProvider || target.model !== config.embeddingModel)
    ) {
      reindex = await showConfirmDialog({
        title: 'Embedding model changes',
        message: `Your search index was built with ${config.embeddingModel}. Re-index now?`,
        confirmLabel: 'Re-index',
        cancelLabel: 'Not now',
      })
    }
    await applyAiPreset(section, id)
    if (reindex) opts.onReindex?.()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e))
  }
}
