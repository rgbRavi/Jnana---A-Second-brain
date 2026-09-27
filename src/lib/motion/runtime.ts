// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Host side of `ctx.motion`. Not a sandbox — a motion plugin is trusted
// main-thread code. What this buys is recoverability: the runtime owns every
// animation, layer, listener and timer a plugin makes through it, so disabling
// the plugin, the panic chord, the fault limit and reduced motion each tear all
// of it down. Real UI can never be left mid-effect (fill forced to 'none').

import { chargePluginCall } from '../../core/plugins/guard'
import { pluginLog } from '../pluginLog'
import { toast } from '../toast'
import { anchorSelector, findAnchor, findAnchors } from './anchors'

export const MOTION_API_VERSION = 1
export const MAX_ANIMATION_MS = 10_000
export const MIN_EVERY_MS = 250
export const MAX_CLONES = 8
const MAX_FAULTS = 5
const LAYER_Z = '2147483000'

export interface MotionAnimateOptions {
  duration: number
  delay?: number
  easing?: string
  iterations?: number
  /** Honoured only for nodes inside this plugin's own layers. */
  fill?: FillMode
}

export interface MotionApi {
  readonly version: number
  /** True under OS reduce-motion, `--motion-scale: 0`, or after the panic chord. */
  reduced(): boolean
  anchor(name: string, key?: string): HTMLElement | null
  anchors(name: string, key?: string): HTMLElement[]
  /** A fresh full-window layer above the app, click-through. Lives until the
   *  plugin removes it or unloads. */
  overlay(): HTMLElement | null
  /** A static copy of `target` at its on-screen spot, in its own layer
   *  (`clone.parentElement` — draw companions there). Media and anchors are
   *  stripped. Layer removed after MAX_ANIMATION_MS. */
  clone(target: Element): HTMLElement | null
  animate(
    target: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options: MotionAnimateOptions,
  ): Animation | null
  /** DOM event anywhere inside an anchor. Returns an unsubscribe. */
  listen(anchor: string, type: string, handler: (el: HTMLElement, event: Event) => void): () => void
  every(ms: number, fn: () => void): () => void
  /** Fires once after `ms` without pointer/keyboard input; re-arms on input. */
  idle(ms: number, fn: () => void): () => void
}

interface Scope {
  pluginId: string
  animations: Set<Animation>
  layers: Set<HTMLElement>
  cleanups: Set<() => void>
  clones: number
  faults: number
  dead: boolean
}

const scopes = new Map<string, Scope>()
let panicked = false

export function motionReduced(): boolean {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return true
  } catch {
    /* no matchMedia */
  }
  const root = document.documentElement
  const raw =
    getComputedStyle(root).getPropertyValue('--motion-scale') ||
    root.style.getPropertyValue('--motion-scale')
  return raw.trim() !== '' && parseFloat(raw) === 0
}

const live = (s: Scope) => !s.dead && !panicked && !motionReduced()

const clampMs = (v: number | undefined) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(v, MAX_ANIMATION_MS)) : 0

function stop(s: Scope): void {
  s.dead = true
  s.animations.forEach((a) => a.cancel())
  s.animations.clear()
  s.layers.forEach((l) => l.remove())
  s.layers.clear()
  s.cleanups.forEach((fn) => {
    try {
      fn()
    } catch {
      /* already gone */
    }
  })
  s.cleanups.clear()
}

function fault(s: Scope, err: unknown): void {
  s.faults += 1
  pluginLog('warn', `Animation error: ${err instanceof Error ? err.message : String(err)}`, s.pluginId)
  if (s.faults >= MAX_FAULTS && !s.dead) {
    stop(s)
    pluginLog('error', `Animations switched off after ${MAX_FAULTS} errors`, s.pluginId)
    toast.error(`Stopped animations from "${s.pluginId}" — they kept failing. The rest of Jnana is fine.`)
  }
}

function run(s: Scope, fn: () => void): void {
  if (!live(s)) return
  try {
    fn()
  } catch (err) {
    fault(s, err)
  }
}

function newLayer(s: Scope): HTMLElement {
  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.dataset.motionLayer = s.pluginId
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: LAYER_Z,
    overflow: 'hidden',
  })
  document.body.appendChild(layer)
  s.layers.add(layer)
  return layer
}

function inOwnLayer(s: Scope, el: Element): boolean {
  for (const layer of s.layers) if (layer.contains(el)) return true
  return false
}

function track(s: Scope, off: () => void): () => void {
  const once = () => {
    off()
    s.cleanups.delete(once)
  }
  s.cleanups.add(once)
  return once
}

export function disposeMotion(pluginId: string): void {
  const s = scopes.get(pluginId)
  if (!s) return
  stop(s)
  scopes.delete(pluginId)
}

export function panicMotion(): void {
  if (panicked) return
  panicked = true
  scopes.forEach(stop)
  toast.info('All animations stopped until Jnana restarts.')
}

let panicInstalled = false
/** Ctrl/⌘+Alt+M anywhere. `code`, not `key`: on macOS Alt+M types "µ". */
export function installMotionPanic(): void {
  if (panicInstalled) return
  panicInstalled = true
  window.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyM') {
        e.preventDefault()
        panicMotion()
      }
    },
    true,
  )
}

export function createMotionApi(pluginId: string): MotionApi {
  disposeMotion(pluginId)
  const s: Scope = {
    pluginId,
    animations: new Set(),
    layers: new Set(),
    cleanups: new Set(),
    clones: 0,
    faults: 0,
    dead: false,
  }
  scopes.set(pluginId, s)
  const charge = () => live(s) && chargePluginCall(pluginId)

  return {
    version: MOTION_API_VERSION,
    reduced: () => panicked || motionReduced(),
    anchor: (name, key) => (charge() ? findAnchor(name, key) : null),
    anchors: (name, key) => (charge() ? findAnchors(name, key) : []),
    overlay: () => (charge() ? newLayer(s) : null),

    clone: (target) => {
      if (!charge() || !target?.isConnected || s.clones >= MAX_CLONES) return null
      const r = target.getBoundingClientRect()
      const copy = target.cloneNode(true) as HTMLElement
      copy.querySelectorAll('iframe,video,audio,script,object,embed').forEach((n) => n.remove())
      for (const n of [copy, ...Array.from(copy.querySelectorAll('[id],[data-anchor]'))]) {
        n.removeAttribute('id')
        n.removeAttribute('data-anchor')
        n.removeAttribute('data-anchor-key')
      }
      copy.setAttribute('inert', '')
      Object.assign(copy.style, {
        position: 'absolute',
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        margin: '0',
        boxSizing: 'border-box',
      })
      const layer = newLayer(s)
      layer.appendChild(copy)
      s.clones += 1
      // ponytail: fixed lifetime, not "when its animations end" — simpler, and an
      // invisible click-through layer lingering a few seconds costs nothing.
      const timer = setTimeout(() => {
        s.clones -= 1
        layer.remove()
        s.layers.delete(layer)
        cancel()
      }, MAX_ANIMATION_MS)
      const cancel = track(s, () => clearTimeout(timer))
      return copy
    },

    animate: (target, keyframes, options) => {
      if (!charge() || !(target instanceof Element) || !target.isConnected) return null
      const duration = clampMs(options?.duration)
      const wanted =
        typeof options?.iterations === 'number' && Number.isFinite(options.iterations) ? options.iterations : 1
      const iterations = Math.max(1, Math.min(wanted, Math.floor(MAX_ANIMATION_MS / Math.max(duration, 1))))
      try {
        const a = target.animate(keyframes, {
          duration,
          delay: clampMs(options?.delay),
          iterations,
          easing: options?.easing ?? 'ease',
          fill: inOwnLayer(s, target) ? (options?.fill ?? 'none') : 'none',
        })
        s.animations.add(a)
        const done = () => s.animations.delete(a)
        a.finished.then(done, done)
        return a
      } catch (err) {
        fault(s, err)
        return null
      }
    },

    listen: (anchor, type, handler) => {
      const sel = anchorSelector(anchor)
      if (!sel || !charge()) return () => {}
      const onEvent = (e: Event) => {
        const hit = e.target instanceof Element ? e.target.closest<HTMLElement>(sel) : null
        if (hit) run(s, () => handler(hit, e))
      }
      document.addEventListener(type, onEvent, true)
      return track(s, () => document.removeEventListener(type, onEvent, true))
    },

    every: (ms, fn) => {
      if (!charge()) return () => {}
      const id = setInterval(() => run(s, fn), Math.max(MIN_EVERY_MS, ms || 0))
      return track(s, () => clearInterval(id))
    },

    idle: (ms, fn) => {
      if (!charge()) return () => {}
      const wait = Math.max(MIN_EVERY_MS, ms || 0)
      const fire = () => run(s, fn)
      let timer = setTimeout(fire, wait)
      const poke = () => {
        clearTimeout(timer)
        timer = setTimeout(fire, wait)
      }
      const inputs = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const
      inputs.forEach((t) => window.addEventListener(t, poke, { passive: true }))
      return track(s, () => {
        clearTimeout(timer)
        inputs.forEach((t) => window.removeEventListener(t, poke))
      })
    },
  }
}

export function __resetMotionForTests(): void {
  scopes.forEach(stop)
  scopes.clear()
  panicked = false
}
