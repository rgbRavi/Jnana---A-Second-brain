// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { showConfirmDialog } from '../../../lib/dialog'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../hooks/useTheme'
import { getViewState, useViewState } from '../../../hooks/useViewState'
import { ThemeEditor } from './ThemeEditor'
import { SettingButton, SettingPanel } from '../SettingLayout'
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

  async function handleReset() {
    // A named preset is one click to get back; only custom work needs a guard.
    if (!theme.presetId) {
      const ok = await showConfirmDialog({
        title: 'Reset theme',
        message: 'Reset to the default Dark theme? Custom changes you have not saved under "Your themes" will be lost.',
        confirmLabel: 'Reset',
        danger: true,
      })
      if (!ok) return
    }
    reset()
  }
  const [overlayOpen, setOverlayOpen] = useViewState('themeStudio.overlayOpen', false)

  return (
    <SettingPanel>
      {overlayOpen ? (
        <div className={styles.poppedOutNotice}>
          <p className={styles.hint}>Theme Studio is open as a floating overlay.</p>
          <SettingButton onClick={() => setOverlayOpen(false)}>
            Dock back into Settings
          </SettingButton>
        </div>
      ) : (
        <ThemeEditor
          api={api}
          trailing={
            <>
              <span className={styles.badge} title={`Current theme: ${theme.presetId ? theme.name : 'Custom'}`}>Current theme: {theme.presetId ? theme.name : 'Custom'}</span>
              <SettingButton onClick={() => void handleReset()}>Reset</SettingButton>
              <SettingButton
                title="Opens Theme Studio over the app so you can see changes on your notes"
                onClick={() => {
                  setOverlayOpen(true)
                  navigate(getViewState<string>('settings.returnTo') ?? '/')
                }}
              >
                Open in floating window
              </SettingButton>
            </>
          }
        />
      )}
    </SettingPanel>
  )
}
