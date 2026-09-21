// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { eventBus } from '../../lib/eventBus'
import { pluginLog } from '../../lib/pluginLog'
import { recordPluginActivity, type PluginActivityKind } from '../../lib/pluginActivity'

// Rate limiting for everything a plugin asks the host to do.
//
// The sandbox decides *what* a plugin may do; this decides *how often*. Without
// it a worker looping `notes.getAll()` drags the whole note table through IPC as
// fast as the main thread will serialize it, and the app stops responding — with
// no way to reach the toggle that would stop it. A plugin that keeps hammering
// past the limit is treated as broken and disabled, loudly, rather than left to
// wedge the app.
//
// Every plugin API wrapper funnels through `guard`, so both runtimes are covered
// by one limiter: a worker's RPC arrives here via the registry, and a main-thread
// plugin's call arrives here directly. (A main-thread plugin can still `invoke`
// Rust itself — that's the trusted-main-thread trade-off, and why `plugin_fetch`
// carries its own limiter Rust-side.)

/** Sustained call budget. Generous for real work, useless for a hot loop. */
const CALLS_PER_SECOND = 50
/** Bucket depth, so a burst of parallel calls isn't punished. */
const BURST = 100
/** Requests in flight at once — a backlog is a symptom, not a workload. */
const MAX_CONCURRENT = 6
/** Refusals before the plugin is considered runaway and switched off. */
const STRIKES_BEFORE_DISABLE = 25

interface Budget {
  tokens: number
  last: number
  inFlight: number
  strikes: number
  warned: boolean
}

const budgets = new Map<string, Budget>()

function budgetFor(pluginId: string): Budget {
  let b = budgets.get(pluginId)
  if (!b) {
    b = { tokens: BURST, last: Date.now(), inFlight: 0, strikes: 0, warned: false }
    budgets.set(pluginId, b)
  }
  const now = Date.now()
  b.tokens = Math.min(BURST, b.tokens + ((now - b.last) / 1000) * CALLS_PER_SECOND)
  b.last = now
  return b
}

function refuse(pluginId: string, b: Budget, why: string): Error {
  b.strikes += 1
  if (!b.warned) {
    b.warned = true
    pluginLog('warn', `Rate limited: ${why}`, pluginId)
  }
  if (b.strikes >= STRIKES_BEFORE_DISABLE) {
    // The registry listens for this and unregisters + persists the off state, so
    // the plugin stays off across restarts until the user turns it back on.
    budgets.delete(pluginId)
    eventBus.emit('plugin:runaway', { pluginId, reason: why })
  }
  return new Error(`Rate limit: ${why}`)
}

/**
 * Charge one **synchronous** call against the plugin's budget. Returns false when
 * it is over, having taken a strike (and tripped `plugin:runaway` at the limit)
 * exactly like the async path.
 *
 * Registering UI is synchronous and returns nothing, so it cannot use `guard` —
 * but it is not free: every `registerBlockPanel` / `setBackground` / `registerTheme`
 * sanitizes its input and notifies every subscriber, so a loop of them re-renders
 * the app as fast as the plugin can call. That is the same wedge `guard` exists to
 * stop, and it arrives through a door `guard` could not see. The caller drops the
 * registration on false rather than throwing, because half of these come from a
 * worker message where there is nobody to throw to.
 */
export function chargePluginCall(pluginId: string, kind: PluginActivityKind = 'ui'): boolean {
  const b = budgetFor(pluginId)
  if (b.tokens < 1) {
    refuse(pluginId, b, `more than ${CALLS_PER_SECOND} calls per second`)
    return false
  }
  b.tokens -= 1
  recordPluginActivity(pluginId, kind)
  return true
}

/**
 * Run one plugin API call under the plugin's budget, counting it for the activity
 * trail. `kind` is what the call costs the app, not what it returns.
 */
export async function guard<T>(
  pluginId: string,
  kind: 'reads' | 'writes' | 'requests',
  run: () => Promise<T>,
): Promise<T> {
  const b = budgetFor(pluginId)
  if (b.inFlight >= MAX_CONCURRENT) {
    throw refuse(pluginId, b, `${MAX_CONCURRENT} calls already in flight`)
  }
  if (b.tokens < 1) {
    throw refuse(pluginId, b, `more than ${CALLS_PER_SECOND} calls per second`)
  }
  b.tokens -= 1
  b.inFlight += 1
  recordPluginActivity(pluginId, kind)
  try {
    return await run()
  } finally {
    b.inFlight -= 1
  }
}

/** Forget a plugin's budget (on unregister, so a reload starts clean). */
export function resetPluginBudget(pluginId: string): void {
  budgets.delete(pluginId)
}
