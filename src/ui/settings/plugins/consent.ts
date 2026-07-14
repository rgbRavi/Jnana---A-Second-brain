// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { showConfirmDialog } from '../../../lib/dialog'
import type { PluginManifestPreview } from '../../../core/plugins/loader'

/** Human labels for known permission ids (falls back to the raw id). */
const PERMISSION_LABELS: Record<string, string> = {
  notes: 'Read and modify your notes',
  network: 'Access the network',
}

/**
 * Install-consent prompt. Loading a plugin runs third-party code with the host's
 * privileges, so this is the trust gate: it lists the requested permissions and
 * requires an explicit, destructive-styled confirmation. Phase 1 grants the full
 * requested set (all-or-nothing); returns the granted permissions or `null` if the
 * user declined.
 */
export async function confirmPluginInstall(
  manifest: PluginManifestPreview,
): Promise<string[] | null> {
  const perms = manifest.permissions ?? []
  const permLines = perms.length
    ? 'Requested permissions:\n' + perms.map((p) => `  • ${PERMISSION_LABELS[p] ?? p}`).join('\n')
    : 'No special permissions requested.'

  const ok = await showConfirmDialog({
    title: `Install ${manifest.name}?`,
    message:
      `This runs third-party code inside Jnana with the same access as the app. ` +
      `Only install plugins from sources you trust.\n\n${permLines}`,
    confirmLabel: 'Install',
    danger: true,
  })

  return ok ? perms : null
}
