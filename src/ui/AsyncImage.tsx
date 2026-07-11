// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useRef, useState, useEffect } from 'react'

interface Props {
  filename: string
  alt?: string
  className?: string
  lazy?: boolean
}

function assetUrl(filename: string): string {
  return `http://jnana-asset.localhost/${filename}`
}

export function AsyncImage({ filename, alt, className, lazy = true }: Props) {
  const [visible, setVisible] = useState(!lazy)
  const containerRef = useRef<HTMLDivElement>(null)

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
      { rootMargin: '50px' }
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
          minHeight: '200px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="image-loading">Loading image...</span>
      </div>
    )
  }

  return (
    <div ref={containerRef}>
      <img
        src={assetUrl(filename)}
        alt={alt || 'Note attachment'}
        className={className}
      />
    </div>
  )
}
