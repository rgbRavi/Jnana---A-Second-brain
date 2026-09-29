// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useState } from 'react'
import { SettingSelect, SettingSlider, SettingToggle } from '../SettingControls'
import { hostPluginStorage } from '../../../core/plugins/storage'
import { getSettingsDefinition } from '../../../lib/pluginContributions'
import type { PluginSettingField } from '../../../lib/pluginApi'
import Styles from './PluginsPanel.module.css'

/** Where a plugin's settings live in its own storage, so it can read them too. */
export const SETTINGS_KEY = '__settings'

function defaults(fields: PluginSettingField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    out[f.key] = f.default ?? (f.type === 'toggle' ? false : f.type === 'number' ? (f.min ?? 0) : '')
  }
  return out
}

/**
 * A plugin's settings pane, rendered by the app from the field list the plugin
 * declared. Built with the app's own controls, so every plugin's settings look and
 * behave like Jnana's — and a worker plugin, which has no UI whatsoever, can still
 * be configured.
 *
 * Values are stored in the plugin's own `plugin_kv` under `__settings` (so the
 * plugin reads them with `ctx.storage.get('__settings')`) and pushed to the live
 * plugin through its `onChange`, so a change takes effect without a reload.
 */
export function PluginSettingsPane({ pluginId }: { pluginId: string }) {
  const definition = getSettingsDefinition(pluginId)
  const [values, setValues] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!definition) return
    let alive = true
    void hostPluginStorage(pluginId)
      .get<Record<string, unknown>>(SETTINGS_KEY)
      .then((stored) => {
        if (alive) setValues({ ...defaults(definition.fields), ...(stored ?? {}) })
      })
    return () => {
      alive = false
    }
  }, [pluginId, definition])

  const update = useCallback(
    (key: string, value: unknown) => {
      setValues((prev) => {
        const next = { ...(prev ?? {}), [key]: value }
        void hostPluginStorage(pluginId).set(SETTINGS_KEY, next)
        // Tell the running plugin, so it doesn't need a reload to notice.
        try {
          getSettingsDefinition(pluginId)?.onChange?.(next)
        } catch (err) {
          console.error(`[plugin] ${pluginId} settings onChange threw`, err)
        }
        return next
      })
    },
    [pluginId],
  )

  if (!definition || definition.fields.length === 0 || !values) return null

  return (
    <div className={Styles.settingsPane}>
      {definition.fields.map((field) => {
        const value = values[field.key]
        return (
          <div key={field.key} className={Styles.settingsRow}>
            <div className={Styles.settingsLabel}>
              <span>{field.label}</span>
              {field.hint && <small className={Styles.muted}>{field.hint}</small>}
            </div>
            <div className={Styles.settingsControl}>
              {field.type === 'toggle' && (
                <SettingToggle
                  checked={Boolean(value)}
                  onChange={(v) => update(field.key, v)}
                  ariaLabel={field.label}
                />
              )}
              {field.type === 'select' && (
                <SettingSelect
                  value={String(value ?? '')}
                  onChange={(v) => update(field.key, v)}
                  options={field.options ?? []}
                  ariaLabel={field.label}
                />
              )}
              {field.type === 'number' && (
                <SettingSlider
                  value={Number(value ?? field.min ?? 0)}
                  min={field.min ?? 0}
                  max={field.max ?? 100}
                  step={field.step ?? 1}
                  onChange={(v) => update(field.key, v)}
                  ariaLabel={field.label}
                />
              )}
              {field.type === 'text' && (
                <input
                  className={Styles.settingsInput}
                  value={String(value ?? '')}
                  aria-label={field.label}
                  onChange={(e) => update(field.key, e.target.value)}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
