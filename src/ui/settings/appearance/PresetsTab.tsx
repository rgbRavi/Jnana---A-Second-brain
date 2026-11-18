// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, useSyncExternalStore } from 'react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { showConfirmDialog, showPromptDialog } from '../../../lib/dialog'
import { toast } from '../../../lib/toast'
import { logEvent } from '../../../lib/logger'
import { MAX_THEME_JSON, MAX_THEME_NAME, themeFingerprint } from '../../../core/themes/sanitize'
import { PRESETS, themeFromPreset } from '../../../core/themes/presets'
import {
  applyPluginTheme,
  getPluginThemesVersion,
  listPluginThemes,
  subscribePluginThemes,
} from '../../../lib/pluginThemes'
import { pluginRegistry } from '../../../lib/pluginRegistry'
import { switchThemeWithUndo, type UseThemeApi } from '../../../hooks/useTheme'
import { X } from 'lucide-react'
import { SettingButton, SettingField, SettingSection, settingInputClass } from '../SettingLayout'
import { StudioField } from './controls'
import styles from './Appearance.module.css'

export function PresetsTab({ api }: { api: UseThemeApi }) {
  const { theme, pickPreset, savedThemes, saveCurrent, loadSaved, deleteSaved, importTheme } = api
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const customThemes = savedThemes.filter((s) => !s.isBuiltin)
  // "Active" = identical content, not identical name: duplicates can't both
  // light up by name, and a tweaked theme stops being Active.
  const currentPrint = themeFingerprint(theme)

  // Themes contributed by loaded plugins. They live in the registry, not the DB:
  // unloading the plugin takes its themes with it, and the user's active theme is
  // a plain saved theme by then, so nothing they are looking at disappears.
  useSyncExternalStore(subscribePluginThemes, getPluginThemesVersion, getPluginThemesVersion)
  const pluginThemes = listPluginThemes()

  async function handleSaveCurrent() {
    const name = await showPromptDialog({
      title: 'Save theme',
      placeholder: 'Theme name',
      defaultValue: theme.presetId ? '' : theme.name,
    })
    const trimmed = name?.trim()
    if (!trimmed) return
    if (trimmed.length > MAX_THEME_NAME) {
      toast.error(`Names can be up to ${MAX_THEME_NAME} characters.`)
      return
    }
    const dupe = customThemes.find((s) => s.name.trim().toLowerCase() === trimmed.toLowerCase())
    if (dupe) {
      const ok = await showConfirmDialog({
        title: 'Replace theme',
        message: `You already have a theme called "${dupe.name}". Replace it with the current look?`,
        confirmLabel: 'Replace',
        danger: true,
      })
      if (!ok) return
    }
    try {
      await saveCurrent(trimmed, dupe?.id)
      toast.success(`Saved "${trimmed}".`)
    } catch (err) {
      toast.error("Couldn't save the theme. Try again.")
      logEvent('error', 'theme', 'saveCurrent failed', { error: err })
    }
  }

  async function handleDelete(id: string, name: string) {
    const ok = await showConfirmDialog({
      title: 'Delete theme',
      message: `Delete "${name}"? This can't be undone.`,
      danger: true,
    })
    if (!ok) return
    try {
      await deleteSaved(id)
      toast.success(`Deleted "${name}".`)
    } catch (err) {
      toast.error("Couldn't delete that theme. Try again.")
      logEvent('error', 'theme', 'deleteSaved failed', { error: err })
    }
  }

  async function handleExport() {
    try {
      await writeText(JSON.stringify(theme, null, 2))
      toast.success('Theme copied. Paste it anywhere to share it.')
    } catch (err) {
      toast.error("Couldn't copy to the clipboard. Try again.")
      logEvent('error', 'theme', 'theme export failed', { error: err })
    }
  }

  function handleImport() {
    if (importText.length > MAX_THEME_JSON) {
      setImportError('That text is too large to be a theme.')
      return
    }
    let ok = false
    const undoShown = switchThemeWithUndo(() => { ok = importTheme(importText) })
    if (ok) {
      setImportError(null)
      setImportText('')
      // The undo toast already says what happened; don't stack a second one.
      if (!undoShown) toast.success('Theme applied.')
    } else {
      setImportError("That isn’t a Jnana theme. Paste the full text copied with “Copy theme as text”.")
    }
  }

  return (
    <div className={styles.tabPane}>
      <div className={styles.presetGrid}>
        {PRESETS.map((p) => {
          const active = theme.presetId === p.id
          return (
            <button
              key={p.id}
              type="button"
              className={`${styles.presetCard} ${active ? styles.presetCardActive : ''}`}
              onClick={() => pickPreset(p.id)}
              title={p.blurb}
            >
              <div className={styles.presetSwatchStrip}>
                <span style={{ background: p.swatch[0], flex: 1 }} />
                <span style={{ background: p.swatch[1], flex: 1.3 }} />
                <span style={{ background: p.swatch[2], flex: 1 }} />
              </div>
              <div className={styles.presetCardFooter}>
                <span className={styles.presetName} title={p.name}>{p.name}</span>
                {active && <span className={styles.activeBadge}>Active</span>}
              </div>
            </button>
          )
        })}
      </div>

      {pluginThemes.length > 0 && (
        <SettingSection
          title="From plugins"
          intro="Provided by a plugin. Applying one copies it into your theme — save it under “Your themes” to keep it after the plugin is removed."
        >
          <div className={styles.presetGrid}>
            {pluginThemes.map((t) => {
              const owner = pluginRegistry.get(t.pluginId)?.name ?? t.pluginId
              const swatch = [
                t.tokens['--bg'] ?? 'var(--bg)',
                t.tokens['--accent'] ?? 'var(--accent)',
                t.tokens['--text-1'] ?? 'var(--text-1)',
              ]
              const pluginTheme = applyPluginTheme(themeFromPreset(t.base === 'light' ? 'light' : 'dark'), t)
              const active = theme.presetId === null && themeFingerprint(pluginTheme) === currentPrint
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`${styles.presetCard} ${active ? styles.presetCardActive : ''}`}
                  onClick={() => switchThemeWithUndo(() => importTheme(pluginTheme))}
                  title={`${t.name} — from ${owner}`}
                >
                  <div className={styles.presetSwatchStrip}>
                    <span style={{ background: swatch[0], flex: 1 }} />
                    <span style={{ background: swatch[1], flex: 1.3 }} />
                    <span style={{ background: swatch[2], flex: 1 }} />
                  </div>
                  <div className={styles.presetCardFooter}>
                    <span className={styles.presetName} title={t.name}>{t.name}</span>
                    {active && <span className={styles.activeBadge}>Active</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </SettingSection>
      )}

      <SettingSection title="Your themes">
        {customThemes.length === 0 ? (
          <p className={styles.hint}>Save your current tweaks to build a library of custom themes.</p>
        ) : (
          <ul className={styles.savedList}>
            {customThemes.map((s) => {
              const active = theme.presetId === null && themeFingerprint(s.theme) === currentPrint
              return (
              <li key={s.id} className={styles.savedRow}>
                <button
                  type="button"
                  className={styles.savedName}
                  aria-current={active ? 'true' : undefined}
                  title={s.name}
                  onClick={() => loadSaved(s.id)}
                >
                  {s.name}
                </button>
                {active && <span className={styles.activeBadge}>Active</span>}
                <button
                  type="button"
                  className={styles.savedDelete}
                  title={`Delete ${s.name}`} aria-label={`Delete ${s.name}`}
                  onClick={() => void handleDelete(s.id, s.name)}
                >
                  <X size={14} aria-hidden />
                </button>
              </li>
              )
            })}
          </ul>
        )}
        <SettingButton variant="primary" onClick={() => void handleSaveCurrent()}>
          Save current as new theme
        </SettingButton>
      </SettingSection>

      <SettingSection title="Portability">
        <StudioField label="Share this theme" htmlFor="theme-export">
          {/* id on a wrapper, not the button, so the label doesn't rename it */}
          <div id="theme-export">
            <SettingButton onClick={() => void handleExport()}>Copy theme as text</SettingButton>
          </div>
        </StudioField>
        <SettingField label="Paste a theme" htmlFor="theme-import" stacked>
          <textarea
            id="theme-import"
            aria-invalid={importError ? true : undefined}
            className={`${settingInputClass} ${styles.importTextarea}`}
            placeholder="Paste theme JSON here…"
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value)
              setImportError(null)
            }}
          />
        </SettingField>
        {importError && <p role="alert" className={styles.errorText}>{importError}</p>}
        <div>
          <SettingButton disabled={!importText.trim()} onClick={handleImport}>
            Import theme
          </SettingButton>
        </div>
      </SettingSection>
    </div>
  )
}
