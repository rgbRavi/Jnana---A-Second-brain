// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/lib/logger.ts
//
// App logger built on tauri-plugin-log. Every entry is written to the rotating
// log file (via Rust) AND mirrored to the devtools console. Two consumers:
//
//   import { log } from './logger'      // new, structured logging
//   log.info('backup started', { dest })
//
//   initLogging()                       // once, from main.tsx — installs a tee
//                                       // so the existing console.error/warn
//                                       // calls also reach the log file.
//
// Recursion safety: we capture the *original* console methods up front; both the
// wrapper and the tee print through those (never the patched console), and we
// deliberately don't attachConsole() the Rust side, so nothing loops back.

import { trace, debug, info, warn, error } from '@tauri-apps/plugin-log'

const orig = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
}

const inTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function stringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

type PluginFn = (message: string) => Promise<void>

function emit(
  forward: PluginFn,
  consoleFn: (...a: unknown[]) => void,
  msg: string,
  extra: unknown[],
): void {
  consoleFn(msg, ...extra) // devtools (saved original — never the teed console)
  if (inTauri()) {
    void forward(extra.length ? `${msg} ${stringify(extra)}` : msg).catch(() => {})
  }
}

/** App logger — writes to the rotating log file (via Rust) and the console. */
export const log = {
  trace: (msg: string, ...extra: unknown[]) => emit(trace, orig.debug, msg, extra),
  debug: (msg: string, ...extra: unknown[]) => emit(debug, orig.debug, msg, extra),
  info: (msg: string, ...extra: unknown[]) => emit(info, orig.info, msg, extra),
  warn: (msg: string, ...extra: unknown[]) => emit(warn, orig.warn, msg, extra),
  error: (msg: string, ...extra: unknown[]) => emit(error, orig.error, msg, extra),
}

let initialized = false

/**
 * Install the console tee + global error handlers. Idempotent so StrictMode's
 * double-invoke (and any accidental re-call) is safe.
 */
export function initLogging(): void {
  if (initialized) return
  initialized = true

  // Tee existing console.error/warn into the log file while still printing via
  // the saved original (so devtools output is unchanged and we never recurse).
  const tee =
    (level: 'warn' | 'error', original: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      original(...args)
      if (inTauri()) {
        const fwd = level === 'error' ? error : warn
        void fwd(stringify(args)).catch(() => {})
      }
    }
  console.error = tee('error', orig.error)
  console.warn = tee('warn', orig.warn)

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
      log.error(`Uncaught error: ${e.message}`, e.error ?? '')
    })
    window.addEventListener('unhandledrejection', (e) => {
      log.error('Unhandled promise rejection', e.reason ?? '')
    })
  }
}
