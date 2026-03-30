import { useState, useEffect, useRef } from 'react'

interface Props {
  videoId: string
  title?: string
  className?: string
  lazy?: boolean
}

export function AsyncYouTube({ videoId, title = 'YouTube Video', className, lazy = true }: Props) {
  const [visible, setVisible] = useState(!lazy)
  const [online, setOnline] = useState(navigator.onLine)
  const containerRef = useRef<HTMLDivElement>(null)

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

  // YouTube embed URL with privacy-enhanced mode (no tracking cookies)
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`

  return (
    <div ref={containerRef} className={className}>
      <div className="youtube-container">
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          style={{ border: 'none' }}
        />
      </div>
    </div>
  )
}
