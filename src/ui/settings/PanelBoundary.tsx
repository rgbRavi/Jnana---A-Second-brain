// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { log } from '../../lib/logger'
import styles from '../../views/settings/Settings.module.css'

/** Per-panel boundary: a throw in one Settings panel must not replace the whole
 *  router (or the nav). Keyed by tab at the call site so switching tabs resets it. */
export class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('Settings panel crashed', error, info.componentStack ?? '')
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className={styles.panelError}>
        <p>This section ran into a problem.</p>
        <button type="button" className={styles.backBtn} onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
      </div>
    )
  }
}
