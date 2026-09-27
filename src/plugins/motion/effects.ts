// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The two built-in effects, written against the same `ctx.motion` a third-party
// plugin gets — if these need something the API lacks, so will everyone else.

import type { MotionApi } from '../../lib/motion/runtime'
import { arcPoints } from './paths'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Note crinkles, folds into a ball and is thrown into the bin (or, when the
 *  Trash button isn't on screen, the sidebar Notes link). */
export function foldToBin(motion: MotionApi, noteId: string): void {
  const source = motion.anchor('note', noteId)
  const target = motion.anchor('trash') ?? motion.anchor('sidebar.notes')
  if (!source || !target) return
  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const paper = motion.clone(source)
  if (!paper) return
  paper.style.transformOrigin = 'center'
  paper.style.overflow = 'hidden'

  const crinkle: Keyframe[] = [
    { transform: 'none', offset: 0 },
    { transform: 'perspective(600px) rotateX(35deg) scale(0.9, 0.7) skewX(-6deg)', offset: 0.15 },
    { transform: 'perspective(600px) rotateX(-20deg) rotateY(25deg) scale(0.6, 0.5) skewY(8deg)', offset: 0.3 },
    { transform: 'scale(0.25) rotate(40deg)', borderRadius: '50%', offset: 0.45 },
  ]
  const path = arcPoints(from, to, 6, 120).slice(1)
  const fly: Keyframe[] = path.map((p, i) => {
    const t = (i + 1) / path.length
    return {
      transform: `translate(${p.x}px, ${p.y}px) scale(${0.25 - 0.17 * t}) rotate(${40 + 320 * t}deg)`,
      borderRadius: '50%',
      opacity: t === 1 ? 0 : 1,
      offset: 0.45 + 0.55 * t,
    }
  })
  motion.animate(paper, [...crinkle, ...fly], { duration: 1000, easing: 'ease-in', fill: 'forwards' })
  motion.animate(target, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], {
    duration: 260,
    delay: 900,
  })
}

/** Composer folds into a letter, an arrow draws toward the sidebar Notes link,
 *  and the letter rides it there. */
export function letterToNotes(motion: MotionApi): void {
  const source = motion.anchor('composer')
  const target = motion.anchor('sidebar.notes')
  if (!source || !target) return
  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const paper = motion.clone(source)
  const layer = paper?.parentElement
  if (!paper || !layer) return

  const w = 56
  const h = 38
  const cx = from.left + from.width / 2
  const cy = from.top + from.height / 2

  const letter = document.createElement('div')
  letter.dataset.letter = ''
  Object.assign(letter.style, {
    position: 'absolute',
    left: `${cx - w / 2}px`,
    top: `${cy - h / 2}px`,
    width: `${w}px`,
    height: `${h}px`,
    background: 'var(--surface-2)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-md)',
    opacity: '0',
  })
  const flap = document.createElement('div')
  Object.assign(flap.style, {
    position: 'absolute',
    inset: '0',
    background: 'color-mix(in srgb, var(--accent) 35%, transparent)',
    clipPath: 'polygon(0 0, 50% 60%, 100% 0)',
  })
  letter.appendChild(flap)

  const arc = arcPoints(from, to, 10, 90)
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  Object.assign(svg.style, { position: 'absolute', inset: '0', overflow: 'visible' })
  const line = document.createElementNS(SVG_NS, 'path')
  line.setAttribute('d', arc.map((p, i) => `${i ? 'L' : 'M'}${cx + p.x} ${cy + p.y}`).join(' '))
  line.setAttribute('pathLength', '1')
  line.setAttribute('fill', 'none')
  line.setAttribute('stroke-width', '2')
  line.setAttribute('stroke-linecap', 'round')
  Object.assign(line.style, { stroke: 'var(--accent)', strokeDasharray: '1', strokeDashoffset: '1' })
  const end = arc[arc.length - 1]
  const prev = arc[arc.length - 2]
  const angle = (Math.atan2(end.y - prev.y, end.x - prev.x) * 180) / Math.PI
  const head = document.createElementNS(SVG_NS, 'path')
  head.setAttribute('d', 'M -8 -5 L 0 0 L -8 5')
  head.setAttribute('fill', 'none')
  head.setAttribute('stroke-width', '2')
  head.setAttribute('transform', `translate(${cx + end.x} ${cy + end.y}) rotate(${angle})`)
  Object.assign(head.style, { stroke: 'var(--accent)', opacity: '0' })
  svg.append(line, head)
  layer.append(svg, letter)

  const sx = w / Math.max(1, from.width)
  const sy = h / Math.max(1, from.height)
  motion.animate(paper, [{ transform: 'none', opacity: 1 }, { transform: `scale(${sx}, ${sy})`, opacity: 0 }], {
    duration: 280,
    easing: 'ease-in',
    fill: 'forwards',
  })
  motion.animate(letter, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: 200, fill: 'forwards' })
  motion.animate(line, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
    duration: 380,
    delay: 220,
    easing: 'ease-out',
    fill: 'forwards',
  })
  motion.animate(head, [{ opacity: 0 }, { opacity: 1 }], { duration: 80, delay: 560, fill: 'forwards' })
  motion.animate(
    letter,
    arc.map((p, i) => {
      const t = i / (arc.length - 1)
      return { transform: `translate(${p.x}px, ${p.y}px) scale(${1 - 0.6 * t})`, opacity: t === 1 ? 0 : 1 }
    }),
    { duration: 600, delay: 420, easing: 'ease-in-out', fill: 'forwards' },
  )
  motion.animate(svg, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, delay: 900, fill: 'forwards' })
  motion.animate(target, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], {
    duration: 260,
    delay: 980,
  })
}
