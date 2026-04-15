import { useState, useEffect, useRef } from 'react'

export interface YouTubePlayerHandle {
  seekTo: (seconds: number) => void
}

interface Props {
  videoId: string
  title?: string
  className?: string
  lazy?: boolean
  /** Called once the iframe is ready to accept postMessage commands */
  onReady?: (handle: YouTubePlayerHandle) => void
}

export function AsyncYouTube({ videoId, title = 'YouTube Video', className, lazy = true, onReady }: Props) {
  const [visible, setVisible] = useState(!lazy)
  const [online, setOnline] = useState(navigator.onLine)
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Lazy load: only render the iframe when scrolled into view
  useEffect(() => {
    if (!lazy) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '100px' }
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [lazy])

  // Listen for online/offline events
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Placeholder while lazy-loading
  if (!visible) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          background: 'var(--surface-2)',
          borderRadius: '10px',
          minHeight: '225px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Loading YouTube video...</span>
      </div>
    )
  }

  // Offline state
  if (!online) {
    return (
      <div ref={containerRef} className="youtube-unavailable">
        <div className="youtube-unavailable-content">
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📡</div>
          <div>You're offline</div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', opacity: 0.7 }}>
            This YouTube video will load when you reconnect
          </div>
        </div>
      </div>
    )
  }

  // enablejsapi=1 is required for postMessage seek commands to work
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1`

  const handleIframeLoad = () => {
    if (!onReady || !iframeRef.current) return
    onReady({
      seekTo: (seconds: number) => {
        const win = iframeRef.current?.contentWindow
        if (!win) return
        win.postMessage(JSON.stringify({ event: 'command', func: 'seekTo',   args: [seconds, true] }), '*')
        win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),              '*')
      },
    })
  }

  return (
    <div ref={containerRef} className={className}>
      <div className="youtube-container">
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          style={{ border: 'none' }}
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  )
}
