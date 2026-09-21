// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The layer behind the whole app. Two things can fill it:
//
//   1. the user's own **wallpaper** (Settings → Appearance → Design), and
//   2. a **plugin backdrop** — a drifting gradient, an aurora, or an image the
//      plugin shipped inside its package.
//
// The user's wallpaper wins. A plugin cannot paint over a picture someone chose
// themselves, and a plugin loading later must not silently replace it.
//
// Neither path can reach the network: a wallpaper is copied into the app's own
// assets directory and served over `jnana-asset://`, and a plugin image is read
// out of its folder by Rust and handed over as a `data:` URI. The WebView's CSP
// allows exactly those two and no remote scheme, so "background image" can never
// become "a request to someone's server on every paint".

import { useSyncExternalStore } from 'react'
import {
  getPluginBackground,
  getPluginThemesVersion,
  subscribePluginThemes,
} from '../lib/pluginThemes'
import { useTheme } from '../hooks/useTheme'
import { assetUrl } from '../core/notes'
import styles from './AppBackdrop.module.css'

/** `cover` | `contain` | `tile` → the CSS the layer actually needs. */
function fitStyle(fit: string | undefined): React.CSSProperties {
  if (fit === 'tile') return { backgroundSize: 'auto', backgroundRepeat: 'repeat' }
  if (fit === 'contain') return { backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }
  return { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }
}

/**
 * An image layer plus the scrim that keeps text on top of it readable. The scrim
 * is a separate element blended toward `--bg`, so it re-tints with the theme
 * instead of being baked into the image.
 */
function ImageLayer({
  src,
  fit,
  dim,
  blur,
  opacity,
}: {
  src: string
  fit?: string
  dim?: number
  blur?: number
  opacity?: number
}) {
  return (
    <>
      <div
        aria-hidden="true"
        className={styles.layer}
        style={{
          ...fitStyle(fit),
          backgroundImage: `url("${src}")`,
          opacity: opacity ?? 1,
          filter: blur ? `blur(${blur}px)` : undefined,
          // Blurring samples past the edges, which would show the page through a
          // soft border; scaling up hides it.
          transform: blur ? `scale(${1 + blur / 100})` : undefined,
        }}
      />
      {(dim ?? 0) > 0 && (
        <div aria-hidden="true" className={styles.scrim} style={{ opacity: dim }} />
      )}
    </>
  )
}

export function AppBackdrop() {
  useSyncExternalStore(subscribePluginThemes, getPluginThemesVersion, getPluginThemesVersion)
  const { theme } = useTheme()
  const wallpaper = theme.wallpaper

  if (wallpaper?.asset) {
    // Served by the app's own scheme handler — the one origin the CSP allows.
    return (
      <ImageLayer
        src={assetUrl(wallpaper.asset)}
        fit={wallpaper.fit}
        dim={wallpaper.dim ?? 0.4}
        blur={wallpaper.blur}
      />
    )
  }

  const bg = getPluginBackground()
  if (!bg) return null

  if (bg.kind === 'image') {
    // No `src` yet (or the read failed): render nothing rather than a broken box.
    if (!bg.src) return null
    return <ImageLayer src={bg.src} fit={bg.fit} dim={bg.dim} blur={bg.blur} opacity={bg.opacity} />
  }

  const colors = bg.colors ?? ['var(--bg)', 'var(--surface-2)', 'var(--accent)']
  const stops = colors.join(', ')

  return (
    <div
      aria-hidden="true"
      className={bg.kind === 'aurora' ? `${styles.layer} ${styles.aurora}` : `${styles.layer} ${styles.drift}`}
      style={{
        opacity: bg.opacity,
        // Scaled by --motion-scale, which the app already forces to 0 under
        // prefers-reduced-motion.
        animationDuration: `calc(${bg.speed}s / max(var(--motion-scale), 0.001))`,
        backgroundImage:
          bg.kind === 'aurora'
            ? `radial-gradient(60% 50% at 20% 25%, ${colors[0]} 0%, transparent 60%),
               radial-gradient(55% 45% at 80% 30%, ${colors[1] ?? colors[0]} 0%, transparent 60%),
               radial-gradient(65% 55% at 50% 85%, ${colors[2] ?? colors[0]} 0%, transparent 60%)`
            : `linear-gradient(${bg.angle}deg, ${stops}, ${colors[0]})`,
      }}
    />
  )
}
