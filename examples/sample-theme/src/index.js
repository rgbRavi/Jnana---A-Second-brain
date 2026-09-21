// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

/// <reference path="../../types/jnana-plugin.d.ts" />

// Dusk & Parchment — the reference **theme plugin**.
//
// Its manifest says `"type": "theme"` (it is grouped under Themes in Settings,
// and the install prompt would point out any permission it asked for) and
// `"runtime": "worker"` (it runs sandboxed). Those two together are the honest
// shape for a theme: it changes how Jnana looks and can reach nothing else.
//
// No build step, no react, no permissions. A theme is data.

/** Colours must be six-digit hex: Jnana derives hover, pressed, soft and label
 *  colours from these by channel arithmetic, which needs that form. Anything
 *  else is dropped, with a line in the Plugin Console saying so. */
const DUSK = {
  '--bg': '#0b0e14',
  '--surface': '#111722',
  '--surface-2': '#18202e',
  '--surface-3': '#212c3d',
  '--border': '#243044',
  '--border-hover': '#35455f',
  '--accent': '#6ea8fe',
  '--text-1': '#e6edf7',
  '--text-2': '#9bb0c9',
  '--text-3': '#6d7f96',
  '--radius-md': '12px',
}

const PARCHMENT = {
  '--bg': '#f6f1e7',
  '--surface': '#fffcf6',
  '--surface-2': '#efe8da',
  '--surface-3': '#e5dccb',
  '--border': '#ded4c1',
  '--border-hover': '#c9bca3',
  '--accent': '#9a5b2d',
  '--text-1': '#241d14',
  '--text-2': '#5c5142',
  '--text-3': '#8a7c69',
  '--radius-md': '10px',
}

const plugin = {
  id: 'com.jnana.sample-theme',
  name: 'Dusk & Parchment',
  version: '1.0.0',

  init(ctx) {
    // Registering only *offers* these. They appear in Settings → Appearance →
    // Presets under "From plugins"; the user picks one, and picking it copies the
    // theme into theirs, so uninstalling this plugin never changes their app.
    ctx.ui.registerTheme({ id: 'dusk', name: 'Dusk', base: 'dark', tokens: DUSK })
    ctx.ui.registerTheme({ id: 'parchment', name: 'Parchment', base: 'light', tokens: PARCHMENT })

    // The backdrop is off unless asked for — an animated background is a strong
    // opinion to impose on someone who installed a colour scheme.
    let backdrop = 'off'
    void ctx.storage.get('__settings').then((stored) => {
      if (stored?.backdrop) apply(stored.backdrop)
    })

    function apply(kind) {
      backdrop = kind
      if (kind === 'off') {
        ctx.ui.setBackground(null)
        return
      }
      // No `colors`, so it uses the active theme's own — switch themes and the
      // backdrop follows instead of fighting it.
      ctx.ui.setBackground({
        kind: kind === 'aurora' ? 'aurora' : 'gradient',
        angle: 150,
        speed: kind === 'aurora' ? 70 : 45,
        opacity: kind === 'aurora' ? 0.5 : 0.85,
      })
    }

    ctx.ui.registerSettings({
      fields: [
        {
          key: 'backdrop',
          label: 'Animated backdrop',
          type: 'select',
          default: 'off',
          hint: 'Follows whichever theme is active',
          options: [
            { value: 'off', label: 'Off' },
            { value: 'gradient', label: 'Drifting gradient' },
            { value: 'aurora', label: 'Aurora' },
          ],
        },
      ],
      onChange: (values) => apply(values.backdrop ?? 'off'),
    })

    ctx.ui.registerCommand({
      id: 'sample-theme.toggle-backdrop',
      label: 'Dusk & Parchment: toggle the backdrop',
      icon: '🌗',
      run: () => apply(backdrop === 'off' ? 'gradient' : 'off'),
    })
  },
}

export default plugin
