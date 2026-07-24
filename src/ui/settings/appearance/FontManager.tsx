// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { InstalledFont } from '../../../core/fonts'
import { showConfirmDialog } from '../../../lib/dialog'
import styles from './Appearance.module.css'

/** Install / list / remove user fonts, shown under the font pickers in the Design
 *  tab. Installed families also appear in each picker's "Installed" group. */
export function FontManager({
  installed,
  onInstall,
  onRemove,
}: {
  installed: InstalledFont[]
  onInstall: (paths: string[]) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  async function handleInstall() {
    const picked = await open({
      multiple: true,
      filters: [{ name: 'Fonts', extensions: ['woff2', 'woff', 'ttf', 'otf', 'zip'] }],
    })
    if (!picked) return
    await onInstall(Array.isArray(picked) ? picked : [picked])
  }

  async function handleRemove(font: InstalledFont) {
    const ok = await showConfirmDialog({
      title: 'Remove font',
      message: `Remove "${font.family}"? Any theme still using it falls back to a default font.`,
      confirmLabel: 'Remove',
    })
    if (ok) await onRemove(font.id)
  }

  return (
    <div className={styles.field}>
      <div className={styles.fontInstallRow}>
        <button type="button" className={styles.secondaryBtn} onClick={handleInstall}>
          ＋ Install font…
        </button>
      </div>
      <p className={styles.hint}>
        Get free fonts from{' '}
        <button type="button" className={styles.inlineLink} onClick={() => openUrl('https://fontsource.org')}>
          Fontsource ↗
        </button>{' '}
        or{' '}
        <button type="button" className={styles.inlineLink} onClick={() => openUrl('https://fonts.google.com')}>
          Google Fonts ↗
        </button>
        , download, then Install and pick the <code>.woff2</code>/<code>.ttf</code> files (or the whole{' '}
        <code>.zip</code>).
      </p>

      {installed.length > 0 && (
        <ul className={styles.fontList}>
          {installed.map((f) => (
            <li key={f.id} className={styles.fontRow}>
              <span className={styles.fontName} style={{ fontFamily: `'${f.family}'` }}>
                {f.family}
              </span>
              <span className={styles.fontMeta}>
                {f.faces.length} face{f.faces.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className={styles.fontRemove}
                onClick={() => handleRemove(f)}
                aria-label={`Remove ${f.family}`}
                title={`Remove ${f.family}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
