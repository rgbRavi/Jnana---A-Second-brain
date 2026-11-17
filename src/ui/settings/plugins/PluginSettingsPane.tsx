// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { SettingSelect, SettingSlider, SettingToggle } from '../SettingControls'
import { hostPluginStorage } from '../../../core/plugins/storage'
import { getSettingsDefinition } from '../../../lib/pluginContributions'
import type { PluginSettingField } from '../../../lib/pluginApi'
import { SettingButton, SettingField, settingInputClass, hintId } from '../SettingLayout'
import { toast } from '../../../lib/toast'
import { log } from '../../../lib/logger'
import { registerCloseFlush } from '../../../core/closeGuard'
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
export function PluginSettingsPane({ pluginId, pluginName }: { pluginId: string; pluginName: string }) {
  const definition = getSettingsDefinition(pluginId)
  const [values, setValues] = useState<Record<string, unknown> | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!definition) return
    let alive = true
    setLoadFailed(false)
    hostPluginStorage(pluginId)
      .get<Record<string, unknown>>(SETTINGS_KEY)
      .then((stored) => {
        if (alive) setValues({ ...defaults(definition.fields), ...(stored ?? {}) })
      })
      .catch((err) => {
        log.error('plugin settings load failed', err)
        if (alive) setLoadFailed(true)
      })
    return () => {
      alive = false
    }
  }, [pluginId, definition, attempt])

  // Storage writes are debounced (a slider drag or typing fires per event); the UI
  // value and the plugin's onChange stay immediate. Flushed on unmount.
  const pendingRef = useRef<Record<string, unknown> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const next = pendingRef.current
    pendingRef.current = null
    if (!next) return Promise.resolve()
    return hostPluginStorage(pluginId)
      .set(SETTINGS_KEY, next)
      .catch((err) => {
        log.error('plugin setting save failed', err)
        toast.error(`Couldn't save ${pluginName}'s setting. Try again.`)
      })
  }, [pluginId, pluginName])
  // Unmount and window close (which skips unmount) both flush the pending write.
  useEffect(() => {
    const off = registerCloseFlush(flush)
    return () => {
      off()
      void flush()
    }
  }, [flush])

  // Latest values, read outside the state updater: the write + plugin onChange are
  // side effects, and StrictMode double-runs updaters (double write, double toast).
  const valuesRef = useRef(values)
  valuesRef.current = values

  const update = useCallback(
    (key: string, value: unknown) => {
      const next = { ...(valuesRef.current ?? {}), [key]: value }
      valuesRef.current = next
      setValues(next)
      pendingRef.current = next
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => void flush(), 300)
      // Tell the running plugin, so it doesn't need a reload to notice.
      try {
        getSettingsDefinition(pluginId)?.onChange?.(next)
      } catch (err) {
        log.warn(`plugin ${pluginId} settings onChange threw`, err)
      }
    },
    [pluginId, flush],
  )

  if (!definition || definition.fields.length === 0) return null
  if (loadFailed) {
    return (
      <div className={Styles.settingsPane}>
        <p className={Styles.errorText}>Couldn't load this plugin's settings.</p>
        <SettingButton onClick={() => setAttempt((n) => n + 1)}>Retry</SettingButton>
      </div>
    )
  }
  if (!values) return null

  return (
    <div className={Styles.settingsPane}>
      <h4 className={Styles.subHeading}>Settings</h4>
      {definition.fields.map((field) => (
        <FieldRow key={field.key} field={field} value={values[field.key]} onChange={(v) => update(field.key, v)} />
      ))}
    </div>
  )
}

/** A stored value that's no longer an option (the plugin changed its list) would render
 *  blank — keep it visible as an extra entry instead. */
function selectOptions<T extends { value: string; label: string }>(options: T[], value: string): { value: string; label: string }[] {
  if (value === '' || options.some((o) => o.value === value)) return options
  return [{ value, label: value }, ...options]
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: PluginSettingField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const id = useId()
  if (field.type === 'toggle') {
    return <SettingToggle checked={Boolean(value)} onChange={onChange} label={field.label} hint={field.hint} />
  }
  const described = field.hint ? hintId(id) : undefined
  return (
    <SettingField label={field.label} htmlFor={id} hint={field.hint}>
      {field.type === 'select' && (
        <SettingSelect
          id={id}
          value={String(value ?? '')}
          onChange={onChange}
          options={selectOptions(field.options ?? [], String(value ?? ''))}
          ariaDescribedBy={described}
        />
      )}
      {field.type === 'number' && (
        <SettingSlider
          id={id}
          value={Number(value ?? field.min ?? 0)}
          min={field.min ?? 0}
          max={field.max ?? 100}
          step={field.step ?? 1}
          onChange={onChange}
        />
      )}
      {field.type === 'text' && (
        <input
          id={id}
          className={settingInputClass}
          aria-describedby={described}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </SettingField>
  )
}
