// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { ChevronDown, ChevronUp, PanelBottomClose } from 'lucide-react'
import { useTheme } from '../../../hooks/useTheme'
import { getDialog } from '../../../lib/dialog'
import { useViewState } from '../../../hooks/useViewState'
import { ThemeEditor } from './ThemeEditor'
import { StackedFields } from './controls'
import styles from './Appearance.module.css'

/**
 * Floating, collapsible Theme Studio — mounted once in AppLayout (like
 * NoteCreator/CommandPalette) so it survives navigating away from Settings.
 * "Open in floating window" (in AppearancePanel) opens this and sends you to Home;
 * the rest of the app stays fully usable underneath/around it.
 */
export function ThemeStudioOverlay() {
  const api = useTheme()
  const { theme } = api
  const [open, setOpen] = useViewState('themeStudio.overlayOpen', false)
  const [collapsed, setCollapsed] = useViewState('themeStudio.overlayCollapsed', false)

  function handleExit() {
    setOpen(false)
    setCollapsed(false)
  }
  if (!open) return null

  // Esc docks the overlay only while focus is inside it: it's non-modal, so a
  // document-wide listener would also fire on the Esc meant for Settings (Back),
  // a note modal, etc. preventDefault here (React's root listener runs before
  // document ones) stops useEscapeKey surfaces from acting on the same key;
  // an inner select/menu that handled Esc first has already prevented it.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || getDialog()) return
    e.preventDefault()
    handleExit()
  }

  return (
    <div className={`${styles.overlay} ${collapsed ? styles.overlayCollapsed : ''}`} onKeyDown={onKeyDown}>
      <div className={styles.overlayHeader}>
        <div className={styles.overlayTitle}>
          <span className={styles.title}>Theme Studio</span>
          <span className={styles.badge} title={theme.presetId ? theme.name : 'Custom'}>
            {theme.presetId ? theme.name : 'Custom'}
          </span>
        </div>
        {/* Dock, then the collapse chevron pinned to the corner. */}
        <div className={styles.overlayActions}>
          <button type="button" className={styles.headerBtn} title="Dock back into Settings" onClick={handleExit}>
            <PanelBottomClose size={15} aria-hidden />
            Dock
          </button>
          <button
            type="button"
            className={`${styles.headerBtn} ${styles.headerIconBtn}`}
            title={collapsed ? 'Expand Theme Studio' : 'Collapse Theme Studio'}
            aria-label={collapsed ? 'Expand Theme Studio' : 'Collapse Theme Studio'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className={styles.overlayBody}>
          <StackedFields.Provider value>
            <ThemeEditor api={api} />
          </StackedFields.Provider>
        </div>
      )}
    </div>
  )
}
