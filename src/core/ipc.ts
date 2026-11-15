// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The one door to Rust. A drop-in for `invoke` from '@tauri-apps/api/core' that
// records every command in the developer log: name and duration (trace), failures
// with the error (debug), and slow calls (perf). Callers keep their own error
// handling — a failure here is logged at debug, not error, because most callers
// already toast/log it with better context and the same failure shouldn't be
// reported twice at the same level. What it adds is the trace for the ~160 call
// sites that swallow errors with `.catch(() => {})`.
//
// Arguments and results are never logged: they carry note text, file bytes and
// AI keys. Only the command name, timing and the error message are.

import { invoke as tauriInvoke, type InvokeArgs, type InvokeOptions } from '@tauri-apps/api/core'
import { logEvent, isLogLevelEnabled, newOpId } from '../lib/logger'

/** Above this a call is reported as slow (streaming/AI/conversion commands are expected to be). */
const SLOW_MS = 2000

// Rest args so the forwarded call has exactly the caller's arity (tests assert on it).
export async function invoke<T>(cmd: string, ...rest: [args?: InvokeArgs, options?: InvokeOptions]): Promise<T> {
  const t0 = performance.now()
  try {
    const result = await tauriInvoke<T>(cmd, ...rest)
    const durationMs = performance.now() - t0
    if (durationMs > SLOW_MS) {
      logEvent('debug', 'perf', `Slow IPC: ${cmd}`, { event: 'slow', durationMs })
    } else if (isLogLevelEnabled('trace')) {
      logEvent('trace', 'ipc', cmd, { event: 'ok', durationMs })
    }
    return result
  } catch (e) {
    if (isLogLevelEnabled('debug')) {
      logEvent('debug', 'ipc', `${cmd} failed`, { event: 'fail', durationMs: performance.now() - t0, error: e, opId: newOpId('ipc') })
    }
    throw e
  }
}

export type { InvokeArgs, InvokeOptions }
