// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Coffee, ExternalLink, FolderOpen } from 'lucide-react'
import { log } from '../../lib/logger'
import { toast } from '../../lib/toast'
import { plural } from '../../lib/plural'
import { formatBytes, getDataDir, getStorageStats, revealInFolder, type StorageStats } from '../../core/data'
import { SettingActionRow, SettingButton, SettingPanel, SettingSection } from './SettingLayout'
import icon from '../../assets/jnana-icon.png'
import styles from './AboutPanel.module.css'

// Where the complete corresponding source lives. AGPL §13 requires that users of
// a (modified) network-served version be offered this; showing it here is Jnana's
// "Appropriate Legal Notice". Keep this pointing at the canonical public repo.
const SOURCE_URL = 'https://github.com/rgbRavi/Jnana---A-Second-brain'
const AGPL_URL = 'https://www.gnu.org/licenses/agpl-3.0.html'
// Voluntary support. One quiet link, only here — never a prompt, toast or gate
// (PRODUCT.md: no growth-hacky nudges). Swap for an Open Collective page when the
// project has maintainers to share it with.
const SUPPORT_URL = 'https://buymeacoffee.com/vivekan'

/**
 * Settings → About: who Jnana is, where your data lives (the local-first promise,
 * made visible), and the app's "Appropriate Legal Notices" for AGPL compliance —
 * copyright, no-warranty, the AGPL license, where to get the source, and the
 * plugin exception. See LICENSE and LICENSE-EXCEPTION.md at the repo root.
 */
export function AboutPanel() {
  const [version, setVersion] = useState<string>('')
  const [dataDir, setDataDir] = useState<string | null>(null)
  const [stats, setStats] = useState<StorageStats | null>(null)

  useEffect(() => {
    let alive = true
    getVersion()
      .then((v) => alive && setVersion(v))
      .catch(() => alive && setVersion(''))
    getDataDir()
      .then((d) => alive && setDataDir(d))
      .catch((e) => log.error('Failed to read data folder', e))
    getStorageStats()
      .then((s) => alive && setStats(s))
      .catch((e) => log.error('Failed to read storage stats', e))
    return () => {
      alive = false
    }
  }, [])

  const open = (url: string) => {
    openUrl(url).catch((e) => {
      log.error('Failed to open URL', e)
      toast.error("Couldn't open the link. Check that a web browser is set up.")
    })
  }

  const showFolder = () => {
    if (!dataDir) return
    revealInFolder(dataDir).catch((e) => {
      log.error('Failed to reveal data folder', e)
      toast.error("Couldn't open the folder. Try again.")
    })
  }

  return (
    <SettingPanel>
      {/* Identity: what this is, its version, and where to go next. */}
      <div className={styles.identity}>
        <img className={styles.icon} src={icon} alt="" width={56} height={56} />
        <div className={styles.identityText}>
          <p className={styles.appName}>Jnana</p>
          <p className={styles.meta}>
            {version ? `Version ${version} · ` : ''}Free and open source (AGPL-3.0)
          </p>
          <p className={styles.tagline}>
            A local-first second brain: your notes, media and the links between them, with an optional AI that works
            from your own notes.
          </p>
          <div className={styles.links}>
            <SettingButton onClick={() => open(SOURCE_URL)}>
              Source code <ExternalLink size={14} aria-hidden />
            </SettingButton>
            <SettingButton onClick={() => open(`${SOURCE_URL}/releases`)}>
              Release notes <ExternalLink size={14} aria-hidden />
            </SettingButton>
            <SettingButton onClick={() => open(`${SOURCE_URL}/issues/new`)}>
              Report an issue <ExternalLink size={14} aria-hidden />
            </SettingButton>
          </div>
        </div>
      </div>

      {/* The local-first promise, made visible: where everything is, and how much. */}
      <SettingSection title="Your data">
        <SettingActionRow
          label="Stored on this computer"
          hintVisible
          hint={
            <>
              {stats
                ? `${plural(stats.noteCount, 'note')} and ${formatBytes(stats.assetBytes + stats.dbBytes)} in total, in `
                : 'Your notes and media are kept in '}
              {dataDir ? (
                <code className={styles.path} title={dataDir}>
                  {dataDir}
                </code>
              ) : (
                'a folder on this computer'
              )}
              . Your notes only leave this computer if you set up a cloud AI or web search service.
            </>
          }
        >
          <SettingButton onClick={showFolder} disabled={!dataDir}>
            <FolderOpen size={14} aria-hidden /> Show folder
          </SettingButton>
        </SettingActionRow>
      </SettingSection>

      <SettingSection title="Support">
        <SettingActionRow
          label="Support Jnana"
          hintVisible
          hint="Jnana is free and built in the open. If it's useful to you, a coffee helps keep it going."
        >
          <SettingButton onClick={() => open(SUPPORT_URL)}>
            <Coffee size={14} aria-hidden /> Buy me a coffee <ExternalLink size={14} aria-hidden />
          </SettingButton>
        </SettingActionRow>
      </SettingSection>

      {/* Legal (AGPL Appropriate Legal Notice - do not remove or reword) */}
      <SettingSection title="License">
        <p className={styles.body}>
          Copyright © 2026 Jnana Project. Jnana is free software: you can redistribute it and/or modify it under the terms of the{' '}
          <a
            className={styles.link}
            href={AGPL_URL}
            onClick={(e) => {
              e.preventDefault()
              open(AGPL_URL)
            }}
          >
            GNU Affero General Public License, version 3
          </a>
          .
        </p>
        <p className={styles.body}>
          If you modify Jnana and make it available to others — including over a network — the AGPL requires you to publish your modified source under the same license.
        </p>
        <p className={styles.body}>
          It is distributed in the hope that it will be useful, but <strong>WITHOUT ANY WARRANTY</strong>; without even the implied warranty of merchantability or fitness for a particular purpose.
        </p>
        <p className={styles.body}>
          Plugins that interface with Jnana only through its documented plugin API are exempt from the AGPL and may be released under any terms. See the plugin exception for exact conditions.
        </p>
        <SettingActionRow label="Full texts">
          <SettingButton onClick={() => open(`${SOURCE_URL}/blob/main/LICENSE`)}>
            AGPL-3.0 license <ExternalLink size={14} aria-hidden />
          </SettingButton>
          <SettingButton onClick={() => open(`${SOURCE_URL}/blob/main/LICENSE-EXCEPTION.md`)}>
            Plugin exception <ExternalLink size={14} aria-hidden />
          </SettingButton>
        </SettingActionRow>
      </SettingSection>

      <p className={styles.credits}>
        Built with Tauri · React · TypeScript · SQLite (rusqlite) · CodeMirror 6 · pdf.js · lucide icons. Thanks to the maintainers of these projects.
      </p>
    </SettingPanel>
  )
}
