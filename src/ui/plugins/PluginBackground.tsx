// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The animated backdrop a plugin can ask for. The plugin supplies parameters —
// kind, colours, angle, speed — and this draws it, so the effect is the host's
// code and a plugin cannot paint anything the app didn't write.
//
// Omitting `colors` is the good path: the layer then uses the theme's own
// tokens, so it re-themes with everything else instead of pinning the app to one
// palette. Motion honours `prefers-reduced-motion` through the global
// `--motion-scale` (0 when reduced), so the drift stops rather than distracting
// someone who asked for stillness.

import { useSyncExternalStore } from 'react'
import {
  getPluginBackground,
  getPluginThemesVersion,
  subscribePluginThemes,
} from '../../lib/pluginThemes'
import styles from './PluginBackground.module.css'

export function PluginBackground() {
  useSyncExternalStore(subscribePluginThemes, getPluginThemesVersion, getPluginThemesVersion)
  const bg = getPluginBackground()
  if (!bg) return null

  const colors = bg.colors ?? ['var(--bg)', 'var(--surface-2)', 'var(--accent)']
  const stops = colors.join(', ')

  return (
    <div
      aria-hidden="true"
      className={bg.kind === 'aurora' ? `${styles.layer} ${styles.aurora}` : styles.layer}
      style={{
        opacity: bg.opacity,
        // The duration is scaled by --motion-scale, which the app already forces
        // to 0 under prefers-reduced-motion.
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
