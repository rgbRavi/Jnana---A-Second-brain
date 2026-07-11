// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useTheme } from '../../../hooks/useTheme'
import { useViewState } from '../../../hooks/useViewState'
import { ThemeEditor } from './ThemeEditor'
import styles from './Appearance.module.css'

/**
 * Floating, collapsible Theme Studio — mounted once in AppLayout (like
 * NoteCreator/CommandPalette) so it survives navigating away from Settings.
 * "Pop to overlay" (in AppearancePanel) opens this and sends you to Home;
 * the rest of the app stays fully usable underneath/around it.
 */
export function ThemeStudioOverlay() {
  const api = useTheme()
  const { theme } = api
  const [open, setOpen] = useViewState('themeStudio.overlayOpen', false)
  const [collapsed, setCollapsed] = useViewState('themeStudio.overlayCollapsed', false)

  if (!open) return null

  function handleExit() {
    setOpen(false)
    setCollapsed(false)
  }

  return (
    <div className={`${styles.overlay} ${collapsed ? styles.overlayCollapsed : ''}`}>
      <div className={styles.overlayHeader}>
        <div className={styles.topBarLeft}>
          <span className={styles.title}>Theme Studio</span>
          <span className={styles.badge}>{theme.presetId ? theme.name : 'Custom'}</span>
        </div>
        <div className={styles.topBarRight}>
          <button
            type="button"
            className={styles.secondaryBtn}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? '⌃' : '⌄'}
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={handleExit}>
            Exit
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className={styles.overlayBody}>
          <ThemeEditor api={api} />
        </div>
      )}
    </div>
  )
}
