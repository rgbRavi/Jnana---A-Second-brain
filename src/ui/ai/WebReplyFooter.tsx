// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import type { Citation, WebNotice, WebSourceRef } from '../../core/ai/webContext'
import { openWebPage } from '../../core/ai/web'
import styles from './Ai.module.css'

function hostOf(url: string): string {
  try { return new URL(url).host } catch { return url }
}

interface Props {
  sources?: WebSourceRef[]
  citations?: Citation[]
  notice?: WebNotice
  onSwitchToAlways?: () => void
}

/** Under a web-backed reply: pages read, checked quotes, and any notice. */
export function WebReplyFooter({ sources, citations, notice, onSwitchToAlways }: Props) {
  if (!sources?.length && !citations?.length && !notice) return null
  const byPage = new Map((sources ?? []).map((s) => [s.n, s]))
  const cites = [...(citations ?? [])].sort((a, b) => a.marker - b.marker)
  return (
    <div className={styles.webFooter}>
      {!!sources?.length && (
        <div className={styles.webFooterRow}>
          <span className={styles.webFooterLabel}>Sources</span>
          {sources.map((s) => (
            <button key={s.n} type="button" className={styles.sourceChip} title={s.title} onClick={() => void openWebPage(s.url)}>
              {s.n}. {s.title} — {hostOf(s.url)}
            </button>
          ))}
        </div>
      )}
      {cites.length > 0 && (
        <div>
          <span className={styles.webFooterLabel}>Citations</span>
          <ul className={styles.webCites}>
            {cites.map((c, i) => {
              const src = byPage.get(c.page)
              return (
                <li key={`${c.marker}-${i}`}>
                  [{c.marker}]{' '}
                  {c.page === 0 ? (
                    // A marker the reply used but never listed: no page, no quote.
                    <span>no source given</span>
                  ) : (
                    <>
                      “{c.quote}” —{' '}
                      {c.verified && src ? (
                        <button type="button" className={styles.webCiteLink} onClick={() => void openWebPage(src.url)}>page {c.page}</button>
                      ) : (
                        <span>page {c.page}</span>
                      )}
                    </>
                  )}{' '}
                  <span className={c.verified ? styles.webCiteOk : styles.webCiteWarn}>{c.verified ? 'checked' : 'unverified'}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {notice && (
        <div className={styles.webFooterRow}>
          <span className={styles.webNotice}>{notice.text}</span>
          {notice.kind === 'tools-unsupported' && onSwitchToAlways && (
            <button type="button" className={styles.webCiteLink} onClick={onSwitchToAlways}>Switch to Always search</button>
          )}
        </div>
      )}
    </div>
  )
}
