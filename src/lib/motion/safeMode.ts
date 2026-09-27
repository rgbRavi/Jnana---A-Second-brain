// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Motion safe mode. A motion plugin can freeze the WebView, and a frozen app has
// no Settings to switch it off from — so the boot itself keeps score. Each launch
// writes 'pending'; surviving HEALTHY_MS (or closing cleanly) writes 'ok'; a
// render crash inside that window writes 'failed'. A launch that finds anything
// but 'ok' skips motion plugins for that session only — surviving it writes 'ok'
// again, so the next launch is normal. Read synchronously at boot, before plugins load.

import { toast } from '../toast'

const KEY = 'jnana.motion.boot.v1'
export const HEALTHY_MS = 15_000

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function write(value: 'pending' | 'ok' | 'failed'): void {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    /* storage unavailable — safe mode just never trips */
  }
}

let begun = false
let safe = false
let told = false

export function beginMotionBoot(): void {
  if (begun) return
  begun = true
  const last = read()
  safe = last === 'pending' || last === 'failed'
  write('pending')
  const healthy = () => {
    if (read() === 'pending') write('ok')
  }
  setTimeout(healthy, HEALTHY_MS)
  window.addEventListener('pagehide', healthy)
}

/** From the error boundary. Only counts inside the boot window. */
export function markMotionBootFailed(): void {
  if (read() === 'pending') write('failed')
}

export function isMotionSafeMode(): boolean {
  return safe
}

export function reportMotionPluginSkipped(): void {
  if (told) return
  told = true
  toast.info(
    "Jnana didn't close cleanly last time, so animation plugins are off for this session. " +
      'Restart Jnana to turn them back on.',
  )
}
