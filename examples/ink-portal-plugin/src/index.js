// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Ink Portal: click a sidebar item that changes the view, and a drop of ink
// splashes from the click and washes across the main area as the new view
// appears. Pure overlay — the real UI is never touched. Plain JS, no build step.

// A click only counts if the route changes this soon after it (a sidebar click
// that doesn't navigate — collapse, disclosure toggles — plays nothing).
const CLICK_TO_ROUTE_MS = 600
const DURATION_MS = 720
const DROPLETS = 7

export default {
  id: 'com.jnana.ink-portal',
  name: 'Ink Portal',
  version: '1.0.0',
  init(ctx) {
    const motion = ctx.motion
    if (!motion) return // `motion` not granted, or running sandboxed (no DOM)

    let lastClick = null
    motion.listen('sidebar', 'click', (_el, event) => {
      lastClick = { x: event.clientX, y: event.clientY, at: Date.now() }
    })

    // Claimed with motion.on: if another plugin animates view switches too, only
    // one plays. route:changed also fires on first mount — no recent click, so
    // nothing plays.
    motion.on('route:changed', () => {
      const click = lastClick
      lastClick = null
      if (!click || Date.now() - click.at > CLICK_TO_ROUTE_MS) return
      splash(motion, click.x, click.y)
    })
  },
}

export function splash(motion, x, y) {
  const main = motion.anchor('main')
  if (!main) return
  const layer = motion.overlay()
  if (!layer) return
  const r = main.getBoundingClientRect()

  // The wash: an ink-tinted sheet over the main area, revealed by a growing circle
  // centred on the click (which sits in the sidebar, so it sweeps in from the left).
  const cx = x - r.left
  const cy = y - r.top
  const reach = Math.hypot(Math.max(cx, r.width - cx), Math.max(cy, r.height - cy))
  const wash = document.createElement('div')
  Object.assign(wash.style, {
    position: 'absolute',
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    background:
      `radial-gradient(circle at ${cx}px ${cy}px, ` +
      'color-mix(in srgb, var(--accent) 38%, transparent), ' +
      'color-mix(in srgb, var(--accent) 10%, transparent) 70%)',
  })
  layer.appendChild(wash)
  motion.animate(
    wash,
    [
      { clipPath: `circle(0px at ${cx}px ${cy}px)`, opacity: 1 },
      { clipPath: `circle(${reach}px at ${cx}px ${cy}px)`, opacity: 0.85, offset: 0.55 },
      { clipPath: `circle(${reach}px at ${cx}px ${cy}px)`, opacity: 0 },
    ],
    { duration: DURATION_MS, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' },
  )

  // The ripple ring where the drop landed.
  const ring = document.createElement('div')
  Object.assign(ring.style, {
    position: 'absolute',
    left: `${x - 20}px`,
    top: `${y - 20}px`,
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '2px solid var(--accent)',
  })
  layer.appendChild(ring)
  motion.animate(
    ring,
    [
      { transform: 'scale(0.2)', opacity: 1 },
      { transform: 'scale(3)', opacity: 0 },
    ],
    { duration: 520, easing: 'ease-out', fill: 'forwards' },
  )

  // Droplets flung toward the page, like a drop hitting water.
  for (let i = 0; i < DROPLETS; i++) {
    const angle = -Math.PI / 2.4 + (i / (DROPLETS - 1)) * (Math.PI / 1.2) // fan to the right
    const dist = 40 + ((i * 37) % 50)
    const size = 5 + (i % 3) * 2
    const dot = document.createElement('div')
    Object.assign(dot.style, {
      position: 'absolute',
      left: `${x - size / 2}px`,
      top: `${y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: 'var(--accent)',
    })
    layer.appendChild(dot)
    motion.animate(
      dot,
      [
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        {
          transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.3)`,
          opacity: 0,
        },
      ],
      { duration: 460, easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)', fill: 'forwards' },
    )
  }

  // Overlays live until removed; the runtime drops detached layers on its own.
  setTimeout(() => layer.remove(), DURATION_MS + 80)
}
