import { useState } from 'react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { showConfirmDialog, showPromptDialog } from '../../../lib/dialog'
import { toast } from '../../../lib/toast'
import { PRESETS } from '../../../core/themes/presets'
import type { UseThemeApi } from '../../../hooks/useTheme'
import styles from './Appearance.module.css'

export function PresetsTab({ api }: { api: UseThemeApi }) {
  const { theme, pickPreset, savedThemes, saveCurrent, loadSaved, deleteSaved, importTheme } = api
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const customThemes = savedThemes.filter((s) => !s.isBuiltin)

  async function handleSaveCurrent() {
    const name = await showPromptDialog({
      title: 'Save theme',
      placeholder: 'Theme name',
      defaultValue: theme.presetId ? '' : theme.name,
    })
    if (!name) return
    try {
      await saveCurrent(name)
      toast.success(`Saved "${name}"`)
    } catch (err) {
      toast.error('Failed to save theme')
      console.error('[PresetsTab] saveCurrent failed', err)
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
      toast.success(`Deleted "${name}"`)
    } catch (err) {
      toast.error('Failed to delete theme')
      console.error('[PresetsTab] deleteSaved failed', err)
    }
  }

  async function handleExport() {
    try {
      await writeText(JSON.stringify(theme, null, 2))
      toast.success('Copied theme JSON to clipboard')
    } catch (err) {
      toast.error('Failed to copy to clipboard')
      console.error('[PresetsTab] export failed', err)
    }
  }

  function handleImport() {
    try {
      const parsed = JSON.parse(importText)
      importTheme(parsed)
      setImportError(null)
      setImportText('')
      toast.success('Theme imported')
    } catch {
      setImportError("Invalid JSON — check the pasted theme and try again.")
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
                <span className={styles.presetName}>{p.name}</span>
                {active && <span className={styles.activeBadge}>ACTIVE</span>}
              </div>
            </button>
          )
        })}
      </div>

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Your themes</p>
        {customThemes.length === 0 ? (
          <p className={styles.hint}>Save your current tweaks to build a library of custom themes.</p>
        ) : (
          <ul className={styles.savedList}>
            {customThemes.map((s) => (
              <li key={s.id} className={styles.savedRow}>
                <button type="button" className={styles.savedName} onClick={() => loadSaved(s.id)}>
                  {s.name}
                </button>
                <button
                  type="button"
                  className={styles.savedDelete}
                  aria-label={`Delete ${s.name}`}
                  onClick={() => void handleDelete(s.id, s.name)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className={styles.primaryBtn} onClick={() => void handleSaveCurrent()}>
          Save current as new theme
        </button>
      </section>

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Portability</p>
        <button type="button" className={styles.primaryBtn} onClick={() => void handleExport()}>
          Export · copy JSON
        </button>
        <textarea
          className={styles.importTextarea}
          placeholder="Paste theme JSON here…"
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value)
            setImportError(null)
          }}
        />
        {importError && <p className={styles.errorText}>{importError}</p>}
        <button type="button" className={styles.secondaryBtn} disabled={!importText.trim()} onClick={handleImport}>
          Import theme
        </button>
      </section>
    </div>
  )
}
