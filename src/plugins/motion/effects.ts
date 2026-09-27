// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The two built-in effects, written against the same `ctx.motion` a third-party
// plugin gets — if these need something the API lacks, so will everyone else.

import type { MotionApi } from '../../lib/motion/runtime'
import { arcPoints } from './paths'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** The note is on screen more than once (gallery card + folder-tree row, or
 *  card + open peek) — pick the one that's actually the eye-catching one.
 *  Ties or all-zero-area (nothing on screen) fall back to the first. */
function largest(els: HTMLElement[]): HTMLElement | null {
  let best: HTMLElement | null = null
  let bestArea = -1
  for (const el of els) {
    const r = el.getBoundingClientRect()
    const area = r.width * r.height
    if (area > bestArea) {
      best = el
      bestArea = area
    }
  }
  return best
}

/** Crease lines, drawn over the paper as it scrunches and on the ball. */
function creases(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('preserveAspectRatio', 'none')
  Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0' })
  for (const d of [
    'M8 38 L33 28 L55 46 L78 30 L96 40',
    'M4 72 L30 56 L52 76 L74 58 L95 68',
    'M38 4 L46 32 L36 58 L50 96',
    'M66 6 L60 38 L74 62 L66 94',
  ]) {
    const line = document.createElementNS(SVG_NS, 'path')
    line.setAttribute('d', d)
    line.setAttribute('fill', 'none')
    line.setAttribute('stroke-width', '1.5')
    line.setAttribute('vector-effect', 'non-scaling-stroke')
    line.style.stroke = 'var(--text-3)'
    svg.appendChild(line)
  }
  return svg
}

// Jagged outline of a crumpled paper ball.
const BALL_OUTLINE =
  'polygon(50% 0%, 63% 9%, 80% 6%, 88% 22%, 100% 38%, 93% 55%, 99% 72%, 84% 84%, 70% 100%, ' +
  '52% 92%, 34% 99%, 20% 86%, 4% 76%, 9% 58%, 0% 40%, 10% 24%, 22% 8%, 36% 11%)'

/**
 * Note folds in half, scrunches up and is thrown into the bin (or, when the
 * Trash button isn't on screen, the sidebar Notes link) as a paper ball.
 *
 * Every keyframe list below keeps one transform-function shape per element.
 * Mixing shapes (`perspective() rotateX()` → `scale() rotate()`) makes the
 * browser interpolate matrices, which reads as a spin-and-shrink, not a fold.
 */
export function foldToBin(motion: MotionApi, noteId: string): void {
  const source = largest(motion.anchors('note', noteId))
  if (!source) return
  const target = motion.anchor('trash') ?? motion.anchor('sidebar.notes')
  if (!target) return
  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const paper = motion.clone(source)
  const layer = paper?.parentElement
  if (!paper || !layer) return
  const w = from.width
  const h = from.height

  // Stage holds the paper in 3D; the paper itself becomes the top half.
  const stage = document.createElement('div')
  Object.assign(stage.style, {
    position: 'absolute',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${w}px`,
    height: `${h}px`,
    perspective: '900px',
    transformStyle: 'preserve-3d',
    transformOrigin: 'center 25%',
  })
  Object.assign(paper.style, { left: '0', top: '0', clipPath: 'inset(0 0 50% 0)' })

  // Bottom half: a two-sided flap hinged on the midline — note on the front,
  // plain paper on the back, so folding it up shows the back of the page.
  const flap = document.createElement('div')
  Object.assign(flap.style, {
    position: 'absolute',
    left: '0',
    top: `${h / 2}px`,
    width: `${w}px`,
    height: `${h / 2}px`,
    transformOrigin: 'top center',
    transformStyle: 'preserve-3d',
  })
  const front = paper.cloneNode(true) as HTMLElement
  Object.assign(front.style, { top: `${-h / 2}px`, clipPath: 'inset(50% 0 0 0)', backfaceVisibility: 'hidden' })
  const back = document.createElement('div')
  Object.assign(back.style, {
    position: 'absolute',
    inset: '0',
    background: 'linear-gradient(to top, color-mix(in srgb, var(--surface-2) 70%, var(--bg)), var(--surface-2))',
    transform: 'rotateX(180deg)',
    backfaceVisibility: 'hidden',
  })
  flap.append(front, back)

  // Creases appear on the folded half as it scrunches.
  const folded = document.createElement('div')
  Object.assign(folded.style, { position: 'absolute', left: '0', top: '0', width: `${w}px`, height: `${h / 2}px` })
  const foldCreases = creases()
  folded.appendChild(foldCreases)

  stage.append(paper, flap, folded)
  layer.appendChild(stage)

  // The paper ball that gets thrown, centred on the folded half.
  const size = Math.round(Math.min(64, Math.max(28, Math.min(w, h) * 0.3)))
  const ballBox = { left: from.left + w / 2 - size / 2, top: from.top + h / 4 - size / 2, width: size, height: size }
  const ball = document.createElement('div')
  ball.dataset.ball = ''
  Object.assign(ball.style, {
    position: 'absolute',
    left: `${ballBox.left}px`,
    top: `${ballBox.top}px`,
    width: `${size}px`,
    height: `${size}px`,
    clipPath: BALL_OUTLINE,
    background:
      'radial-gradient(circle at 35% 30%, var(--surface-3), var(--surface-2) 55%, ' +
      'color-mix(in srgb, var(--surface-2) 60%, var(--bg)))',
    opacity: '0',
  })
  const ballCreases = creases()
  ballCreases.style.opacity = '0.8'
  ball.appendChild(ballCreases)
  layer.appendChild(ball)

  // 1) fold the bottom half up over the top (0–380ms)
  motion.animate(flap, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(180deg)' }], {
    duration: 380,
    easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
    fill: 'forwards',
  })
  // 2) scrunch: uneven squeezes with small wobbles, then hand over to the ball (360–880ms)
  motion.animate(
    stage,
    [
      { transform: 'scale(1, 1) rotate(0deg)', opacity: 1 },
      { transform: 'scale(0.82, 0.9) rotate(-3deg)', opacity: 1, offset: 0.3 },
      { transform: 'scale(0.62, 0.56) rotate(4deg)', opacity: 1, offset: 0.55 },
      { transform: 'scale(0.44, 0.47) rotate(-2deg)', opacity: 1, offset: 0.8 },
      { transform: 'scale(0.32, 0.34) rotate(5deg)', opacity: 0 },
    ],
    { duration: 520, delay: 360, easing: 'ease-in', fill: 'forwards' },
  )
  motion.animate(foldCreases, [{ opacity: 0 }, { opacity: 0.8 }], { duration: 300, delay: 420, fill: 'forwards' })
  motion.animate(
    ball,
    [
      { transform: 'translate(0px, 0px) scale(0.7) rotate(0deg)', opacity: 0 },
      { transform: 'translate(0px, 0px) scale(1) rotate(-8deg)', opacity: 1 },
    ],
    { duration: 160, delay: 760, easing: 'ease-out', fill: 'forwards' },
  )
  // 3) throw it in an arc, a thrown ball's worth of spin (920–1440ms)
  const arc = arcPoints(ballBox, to, 8, 110)
  motion.animate(
    ball,
    arc.map((p, i) => {
      const t = i / (arc.length - 1)
      return {
        transform: `translate(${p.x}px, ${p.y}px) scale(${1 - 0.5 * t}) rotate(${-8 + 160 * t}deg)`,
        opacity: t === 1 ? 0 : 1,
      }
    }),
    { duration: 520, delay: 920, easing: 'ease-in', fill: 'forwards' },
  )
  motion.animate(target, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], {
    duration: 260,
    delay: 1380,
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
