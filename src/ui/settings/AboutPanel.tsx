// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { log } from '../../lib/logger'
import styles from './AboutPanel.module.css'

// Where the complete corresponding source lives. AGPL §13 requires that users of
// a (modified) network-served version be offered this; showing it here is Jnana's
// "Appropriate Legal Notice". Keep this pointing at the canonical public repo.
const SOURCE_URL = 'https://github.com/rgbRavi/Jnana---A-Second-brain'

/**
 * Settings → About: the app's "Appropriate Legal Notices" for AGPL compliance —
 * copyright, no-warranty, the AGPL license, where to get the source, and the
 * plugin exception. See LICENSE and LICENSE-EXCEPTION.md at the repo root.
 */
export function AboutPanel() {
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(''))
  }, [])

  const open = (url: string) => {
    openUrl(url).catch((e) => log.error('Failed to open URL', e))
  }

  return (
    <div className={styles.panel}>
      {/* 1 — Identity */}
      <div className={styles.header}>
        <p className={styles.appName}>Jnana</p>
        <span className={styles.version}>{version ? `Version ${version}` : ''}</span>
      </div>
      <p className={styles.body}>A local-first "second brain": notes, media, a wikilink graph, workspaces, and an optional, locally-grounded AI layer.</p>

      {/* 2 — Links */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Links</p>
        <div className={styles.actions}>
          <button className={styles.button} onClick={() => open(SOURCE_URL)}>View source ↗</button>
          <button className={styles.button} onClick={() => open(`${SOURCE_URL}/releases`)}>Release notes ↗</button>
          <button className={styles.button} onClick={() => open(`${SOURCE_URL}/issues/new`)}>Report an issue ↗</button>
        </div>
      </div>

      {/* 3 — Legal (AGPL Appropriate Legal Notice — do not remove) */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>License</p>
        <p className={styles.body}>
          Copyright © 2026 Jnana Project. Jnana is free software: you can redistribute it and/or modify it under the terms of the{' '}
          <a className={styles.link} onClick={() => open('https://www.gnu.org/licenses/agpl-3.0.html')}>GNU Affero General Public License, version 3</a>
          . It is distributed in the hope that it will be useful, but <strong>WITHOUT ANY WARRANTY</strong>; without even the implied warranty of merchantability or fitness for a particular purpose.
        </p>
        <p className={styles.body}>
          If you modify Jnana and make it available to others — including over a network — the AGPL requires you to publish your modified source under the same license.
        </p>
        <p className={styles.body}>
          Plugins that interface with Jnana only through its documented plugin API are exempt from the AGPL and may be released under any terms. See the plugin exception for exact conditions.
        </p>
        <div className={styles.actions}>
          <button className={styles.button} onClick={() => open(`${SOURCE_URL}/blob/main/LICENSE`)}>AGPL-3.0 license ↗</button>
          <button className={styles.button} onClick={() => open(`${SOURCE_URL}/blob/main/LICENSE-EXCEPTION.md`)}>Plugin exception ↗</button>
        </div>
      </div>

      {/* 4 — Acknowledgements */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Built with</p>
        <p className={styles.body}>Tauri · React · TypeScript · SQLite (rusqlite) · CodeMirror 6 · pdf.js · lucide icons. Thanks to the maintainers of these projects.</p>
      </div>
    </div>
  )
}
