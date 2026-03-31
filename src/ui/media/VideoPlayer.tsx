// src/ui/media/VideoPlayer.tsx
import { useEffect, useRef, useState } from 'react'
import type { Options as PlyrOptions } from 'plyr'
import * as PlyrModule from 'plyr'
import 'plyr/dist/plyr.css'

const PlyrConstructor = ((PlyrModule as any).default ?? PlyrModule) as typeof import('plyr').default

interface Props {
  filename: string
  className?: string
  lazy?: boolean
  onReady?: (player: InstanceType<typeof PlyrConstructor>) => void
}

function assetUrl(filename: string): string {
  return `http://jnana-asset.localhost/${filename}`
}

const PLYR_OPTIONS: PlyrOptions = {
  controls: [
    'play-large', 'play', 'progress', 'current-time',
    'duration', 'mute', 'volume', 'settings', 'fullscreen',
  ],
  settings: ['speed'],
  speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
  keyboard: { focused: true, global: false },
  tooltips: { controls: true, seek: true },
  captions: { active: false },
  fullscreen: { enabled: true, fallback: true, iosNative: false },
}

export function VideoPlayer({ filename, className, lazy = true, onReady }: Props) {
  const [visible, setVisible] = useState(!lazy)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Stable ref so Plyr doesn't remount every time parent re-renders
  const onReadyRef = useRef(onReady)
  useEffect(() => { onReadyRef.current = onReady }, [onReady])

  // Lazy-load: wait until scrolled into view before rendering the video element
  useEffect(() => {
    if (!lazy || visible) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { rootMargin: '200px' }
    )
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [lazy, visible])

  // Mount Plyr once the <video> element is in the DOM.
  //
  // WHY requestAnimationFrame:
  //   When rendered inside a modal overlay, the container element exists in
  //   the DOM but hasn't been painted yet (CSS transition is mid-flight).
  //   Plyr measures the element dimensions on init — if it runs synchronously
  //   during the modal's open animation it measures zero width and produces a
  //   broken static layout. One rAF defers until after the browser's next
  //   paint, at which point the modal has its final dimensions.
  //
  // WHY src on the element, not a <source> child:
  //   WebView2 custom protocol URLs (jnana-asset.localhost) cause Plyr to
  //   read readyState=0 from a <source> child and treat the media as
  //   unloaded. Setting src directly and calling load() forces a fetch
  //   before Plyr initialises.
  useEffect(() => {
    if (!visible) return
    const video = videoRef.current
    if (!video) return

    let player: InstanceType<typeof PlyrConstructor> | null = null
    let cancelled = false

    const init = () => {
      if (cancelled || !videoRef.current) return
      video.src = assetUrl(filename)
      video.load()
      player = new PlyrConstructor(video, PLYR_OPTIONS)
      player.on('ready', () => { onReadyRef.current?.(player!) })
    }

    const rafId = requestAnimationFrame(init)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      if (player) {
        try { video.src = ''; video.load() } catch (_) {}
        player.destroy()
      }
    }
  }, [visible, filename])

  if (!visible) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          background: 'var(--surface-2, #1a1a1f)',
          borderRadius: '10px',
          minHeight: '220px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-2, #666)',
          fontSize: '0.85rem',
        }}
      >
        Loading video…
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`jnana-video-player ${className ?? ''}`}
      style={{ width: '100%', borderRadius: '10px', overflow: 'hidden' }}
    >
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        style={{ width: '100%', display: 'block' }}
      />
    </div>
  )
}