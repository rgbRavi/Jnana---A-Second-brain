// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { CheckCircle2 } from 'lucide-react'
import Styles from './PluginsPanel.module.css'

/**
 * Updates subview. Updates compare an installed plugin's version against a remote
 * catalog, which arrives with the loader + catalog phase. Built-in plugins update
 * with the app itself, so there's nothing to do here yet.
 */
export function PluginUpdates() {
  return (
    <div className={Styles.empty}>
      <CheckCircle2 size={28} className={Styles.emptyIcon} />
      <h3>You're all up to date</h3>
      <p>
        Built-in plugins update together with Jnana. Update checks for installed third-party plugins
        will appear here once the community catalog is available.
      </p>
    </div>
  )
}
