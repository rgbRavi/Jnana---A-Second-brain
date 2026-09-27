// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// One trigger of each kind a motion plugin has: an app event, a DOM event on an
// anchor, and a background timer. Plain JS, no build step.

export default {
  id: 'com.jnana.sample-motion',
  name: 'Confetti on Save',
  version: '1.0.0',
  init(ctx) {
    const motion = ctx.motion
    if (!motion) return // `motion` not granted, or running sandboxed (no DOM)

    // App event — every ctx.bus event is a trigger.
    ctx.bus.on('composer:saving', () => burst(motion, motion.anchor('composer')))

    // DOM event inside an anchor.
    motion.listen('sidebar.notes', 'click', (el) => {
      motion.animate(el, [{ transform: 'scale(1)' }, { transform: 'scale(0.92)' }, { transform: 'scale(1)' }], {
        duration: 220,
      })
    })

    // Background — after a minute without input, the Notes link gives a nudge.
    motion.idle(60_000, () => {
      const el = motion.anchor('sidebar.notes')
      if (!el) return
      motion.animate(
        el,
        [{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0)' }],
        { duration: 500 },
      )
    })
  },
}

function burst(motion, source) {
  if (!source) return
  const layer = motion.overlay()
  if (!layer) return
  const r = source.getBoundingClientRect()
  const pieces = 24 // each animate() is one unit of the 50/s budget
  for (let i = 0; i < pieces; i++) {
    const bit = document.createElement('div')
    Object.assign(bit.style, {
      position: 'absolute',
      left: `${r.left + r.width / 2}px`,
      top: `${r.top + r.height / 2}px`,
      width: '8px',
      height: '8px',
      borderRadius: '2px',
      background: i % 2 ? 'var(--accent)' : 'var(--star)',
    })
    layer.appendChild(bit)
    const angle = (i / pieces) * Math.PI * 2
    const dist = 80 + Math.random() * 80
    motion.animate(
      bit,
      [
        { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
        {
          transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist + 60}px) rotate(${Math.random() * 360}deg)`,
          opacity: 0,
        },
      ],
      { duration: 900, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' },
    )
  }
  setTimeout(() => layer.remove(), 1000)
}
