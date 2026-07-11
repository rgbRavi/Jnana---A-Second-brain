// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect } from 'react'
import styles from './Dashboard.module.css'
import { SECTIONS } from './registry'
import { useDashboardPrefs } from './useDashboardPrefs'
import { ALL_SECTIONS } from './types'

/** Dashboard preferences panel: show/hide sections (Phase 1). Phase 2 adds
 *  drag-reorder + saved layouts. */
export function CustomizePanel({ onClose }: { onClose: () => void }) {
  const prefs = useDashboardPrefs()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={styles.customizeOverlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.customizePanel} role="dialog" aria-modal="true" aria-label="Customize dashboard">
        <div className={styles.customizeHead}>
          <h2 className={styles.customizeTitle}>Customize dashboard</h2>
          <button type="button" className={styles.cardBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className={styles.customizeHint}>Choose which sections appear on your Home dashboard.</p>

        <div className={styles.customizeList}>
          {ALL_SECTIONS.map((id) => (
            <label key={id} className={styles.customizeRow}>
              <input type="checkbox" checked={!prefs.isHidden(id)} onChange={() => prefs.toggleHidden(id)} />
              <span className={styles.customizeIcon} aria-hidden="true">
                {SECTIONS[id].icon}
              </span>
              <span className={styles.customizeName}>{SECTIONS[id].title}</span>
            </label>
          ))}
        </div>

        <div className={styles.customizeFooter}>
          <button type="button" className={styles.resetBtn} onClick={() => prefs.resetLayout()}>
            Reset to default
          </button>
          <span className={styles.customizeNote}>Drag the ⠿ handle to reorder · save layouts from the top dropdown.</span>
        </div>
      </div>
    </div>
  )
}
