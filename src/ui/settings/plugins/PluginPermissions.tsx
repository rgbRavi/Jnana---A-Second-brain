// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import {
  revokePluginPermissions,
  previewPluginGrant,
  applyPluginGrant,
  type InstalledPlugin,
} from '../../../core/plugins/loader'
import { SettingToggle } from '../SettingControls'
import { showConfirmDialog } from '../../../lib/dialog'
import { toast } from '../../../lib/toast'
import { log } from '../../../lib/logger'
import Styles from './PluginsPanel.module.css'

const LABELS: Record<string, string> = {
  notes: 'Read and modify notes',
  media: 'Read and add attachments',
  network: 'Contact the internet',
  motion: 'Animate the app',
}

/**
 * Per-permission switches for an installed plugin.
 *
 * Consent used to be a single moment: grant everything at install, and the only
 * way to take anything back was to uninstall (losing the plugin's data with it).
 * Revoking here is immediate and always allowed — Rust refuses anything that isn't
 * a narrowing — and the plugin is reloaded at once, so it loses the capability now
 * rather than at next launch. Granting back is a fresh decision, so it is confirmed
 * and bounded by what the plugin's own manifest declared.
 */
export function PluginPermissions({
  plugin,
  onChanged,
}: {
  plugin: InstalledPlugin
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const declared = plugin.permissions ?? []
  if (declared.length === 0) return null

  const toggle = async (permission: string, next: boolean) => {
    setBusy(true)
    try {
      if (!next) {
        const keep = plugin.granted.filter((p) => p !== permission)
        await revokePluginPermissions(plugin, keep)
        toast.success(`${plugin.name} can no longer ${LABELS[permission]?.toLowerCase() ?? permission}.`)
      } else {
        const preview = await previewPluginGrant(plugin.id, [permission])
        const hosts = permission === 'network' && preview.hosts?.length ? `\n\nIt would reach: ${preview.hosts.join(', ')}` : ''
        const ok = await showConfirmDialog({
          title: `Let ${plugin.name} ${LABELS[permission]?.toLowerCase() ?? permission}?`,
          message: `You took this permission away earlier. Giving it back applies immediately.${hosts}`,
          confirmLabel: 'Allow',
          danger: true,
        })
        if (!ok) return
        await applyPluginGrant(preview.consentToken)
        toast.success(`${plugin.name} can ${LABELS[permission]?.toLowerCase() ?? permission} again.`)
      }
      onChanged()
    } catch (err) {
      log.error('plugin permission change failed', err)
      toast.error(`Couldn't change ${plugin.name}'s permissions. Try again.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={Styles.permissionPane}>
      <h4 className={Styles.subHeading}>Permissions</h4>
      {declared.map((permission) => {
        const on = plugin.granted.includes(permission)
        const label = LABELS[permission] ?? permission
        const hosts = permission === 'network' && plugin.hosts?.length ? plugin.hosts.join(', ') : null
        return (
          <SettingToggle
            key={permission}
            checked={on}
            disabled={busy}
            label={label}
            hintVisible
            hint={
              on
                ? hosts
                  ? `allowed to reach ${hosts}`
                  : 'allowed — switch off to take it away'
                : 'revoked — the plugin cannot do this'
            }
            onChange={(next) => void toggle(permission, next)}
          />
        )
      })}
    </div>
  )
}
