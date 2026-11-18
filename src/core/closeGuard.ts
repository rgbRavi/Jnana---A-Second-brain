// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Closing the window kills the WebView without unmounting React, so a debounced
// autosave still waiting on its timer (Working Notes waits 800 ms) never runs and
// the last edits are lost. Editors register a flush here; on close-requested the
// window waits for every flush (bounded, so a hung save can't trap the user in a
// window that won't close), then destroys itself.

import { getCurrentWindow } from '@tauri-apps/api/window'
import { logEvent } from '../lib/logger'

type Flush = () => Promise<void>

const flushers = new Set<Flush>()

/** Run `flush` before the window closes. Returns the unregister function. */
export function registerCloseFlush(flush: Flush): () => void {
  flushers.add(flush)
  return () => {
    flushers.delete(flush)
  }
}

/** Await every registered flush, giving up after `timeoutMs`. Never rejects. */
export async function flushBeforeClose(timeoutMs = 3000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const t0 = performance.now()
  const pending = flushers.size
  const outcome = await Promise.race([
    Promise.allSettled([...flushers].map((f) => f())).then((r) => r.filter((x) => x.status === 'rejected').length),
    new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs)
    }),
  ])
  clearTimeout(timer)
  const durationMs = performance.now() - t0
  if (outcome === 'timeout') {
    logEvent('warn', 'lifecycle', `Shutdown: gave up waiting on pending saves after ${timeoutMs} ms`, { event: 'shutdown', durationMs, data: { pending } })
  } else {
    logEvent(outcome ? 'error' : 'info', 'lifecycle', `Shutdown: flushed ${pending} pending save(s)${outcome ? `, ${outcome} failed` : ''}`, { event: 'shutdown', durationMs })
  }
}

/** Hook the window's close request (Tauri only). Returns a cleanup function. */
export function installCloseGuard(): () => void {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return () => {}
  let unlisten: (() => void) | undefined
  let disposed = false
  // onCloseRequested destroys the window after the handler resolves
  // (needs core:window:allow-destroy).
  void getCurrentWindow()
    .onCloseRequested(() => flushBeforeClose())
    .then((fn) => {
      if (disposed) fn()
      else unlisten = fn
    })
    .catch(() => {
      /* no window API (tests / browser dev) — closing just skips the flush */
    })
  return () => {
    disposed = true
    unlisten?.()
  }
}
