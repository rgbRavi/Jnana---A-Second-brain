// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../hooks/useTheme'
import { useViewState } from '../../../hooks/useViewState'
import { ThemeEditor } from './ThemeEditor'
import styles from './Appearance.module.css'

/** Settings → Appearance — Theme Studio. Tokens apply straight to the running
 *  app (document.documentElement), so this panel has no separate preview —
 *  the whole app, this panel included, repaints live as you edit. Can be
 *  popped into a floating overlay (see ThemeStudioOverlay, mounted in
 *  AppLayout) so it survives navigating away from Settings. */
export function AppearancePanel() {
  const navigate = useNavigate()
  const api = useTheme()
  const { theme, reset } = api
  const [overlayOpen, setOverlayOpen] = useViewState('themeStudio.overlayOpen', false)

  return (
    <div className={styles.panel}>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.title}>Theme Studio</span>
          <span className={styles.badge}>{theme.presetId ? theme.name : 'Custom'}</span>
        </div>
        <div className={styles.topBarRight}>
          <button type="button" className={styles.secondaryBtn} onClick={reset}>
            Reset
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              setOverlayOpen(true)
              navigate('/')
            }}
          >
            Pop to overlay
          </button>
        </div>
      </div>

      {overlayOpen ? (
        <div className={styles.poppedOutNotice}>
          <p className={styles.hint}>Theme Studio is open as a floating overlay.</p>
          <button type="button" className={styles.secondaryBtn} onClick={() => setOverlayOpen(false)}>
            Dock back here
          </button>
        </div>
      ) : (
        <ThemeEditor api={api} />
      )}
    </div>
  )
}
