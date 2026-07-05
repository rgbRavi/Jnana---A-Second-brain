import { useEffect, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { fetchLinkPreview, domainOf, type LinkPreview } from '../core/linkPreview'
import { useInView } from '../hooks/useInView'
import { toast } from '../lib/toast'
import styles from './WebEmbed.module.css'

interface Props {
  url: string
  /** Compact layout for dense contexts (canvas nodes). */
  compact?: boolean
  /** Defer the Open-Graph preview fetch until the card scrolls into view.
   *  On in note cards, off (default) in always-visible contexts like the canvas. */
  lazy?: boolean
}

/**
 * Map a URL to an embeddable variant where the canonical page blocks framing.
 * YouTube watch/short links can't be iframed, but their /embed/ form can.
 */
function liveSrc(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  return url
}

/**
 * An embedded web page. Defaults to a bookmark/link-preview card (OG metadata
 * fetched + cached Rust-side); "Live view" best-effort loads the page in a
 * sandboxed iframe (many sites block framing — hence the open-in-browser action).
 * Shared by the `![webpage](url)` note embed and canvas link nodes.
 */
export function WebEmbed({ url, compact = false, lazy = false }: Props) {
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const domain = domainOf(url)
  // Every `![webpage]` fires a Rust preview fetch (network on cache-miss); on a
  // Notes page full of embeds that's a fetch storm on load. Defer until visible.
  const [ref, inView] = useInView<HTMLDivElement>(lazy)

  useEffect(() => {
    if (!inView) return
    let active = true
    setLoading(true)
    fetchLinkPreview(url)
      .then((p) => { if (active) setPreview(p) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [url, inView])

  const open = () => { openUrl(url).catch((e) => toast.error('Could not open link: ' + String(e))) }

  if (live) {
    return (
      <div className={styles.liveWrap} onClick={(e) => e.stopPropagation()}>
        <div className={styles.liveBar}>
          <span className={styles.liveDomain}>{domain}</span>
          <span className={styles.liveActions}>
            <button className={styles.barBtn} onClick={open} title="Open in browser">Open ↗</button>
            <button className={styles.barBtn} onClick={() => setLive(false)} title="Back to card">✕ Card</button>
          </span>
        </div>
        <iframe
          className={styles.frame}
          src={liveSrc(url)}
          title={preview?.title || domain}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        <div className={styles.liveNote}>If the page is blank, the site blocked embedding — use “Open ↗”.</div>
      </div>
    )
  }

  const title = preview?.title?.trim() || url

  return (
    <div ref={ref} className={`${styles.card} ${compact ? styles.compact : ''}`} onClick={(e) => e.stopPropagation()}>
      {preview?.image && !compact && (
        <div className={styles.thumb}>
          <img src={preview.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </div>
      )}
      <div className={styles.body}>
        <div className={styles.site}>
          {preview?.favicon && <img className={styles.favicon} src={preview.favicon} alt="" referrerPolicy="no-referrer" />}
          <span className={styles.siteName}>{preview?.siteName || domain}</span>
        </div>
        <div className={styles.title}>{loading ? 'Loading preview…' : title}</div>
        {!compact && preview?.description && <div className={styles.desc}>{preview.description}</div>}
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={open}>Open ↗</button>
          <button className={styles.actionBtn} onClick={() => setLive(true)}>Live view</button>
        </div>
      </div>
    </div>
  )
}
