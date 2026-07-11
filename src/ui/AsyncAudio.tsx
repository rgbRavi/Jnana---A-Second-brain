// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, useEffect, useRef } from 'react'

interface Props {
  filename: string
  className?: string
  controls?: boolean
  preload?: 'none' | 'metadata' | 'auto'
  lazy?: boolean
}

// Build URL for our custom Rust protocol handler.
// On Windows WebView2, custom schemes are served via http://<scheme>.localhost/
function assetUrl(filename: string): string {
  return `http://jnana-asset.localhost/${filename}`
}

export function AsyncAudio({ filename, className, controls = true, preload = 'metadata', lazy = true }: Props) {
  const [visible, setVisible] = useState(!lazy)
  const containerRef = useRef<HTMLDivElement>(null)

  // Lazy load: only render the <audio> once the container scrolls into view.
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

  if (!visible) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          background: 'var(--surface-2)',
          borderRadius: '10px',
          minHeight: '54px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Loading audio...</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <audio
        src={assetUrl(filename)}
        controls={controls}
        preload={preload}
        className={className}
        style={{ width: '100%', display: 'block' }}
      />
    </div>
  )
}
