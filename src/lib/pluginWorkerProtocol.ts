// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The message protocol between a worker plugin and the host, and the minimal
// Worker surface the registry needs (so the wiring can be tested without a real
// Worker, which jsdom doesn't provide).
//
// A worker plugin has no DOM and no IPC of its own: everything it can do arrives
// through these messages, and the host decides what to honour. That is what makes
// the `notes` permission a real boundary for this runtime rather than a label —
// the host simply refuses an `rpc` for a namespace the plugin wasn't granted.

import type { PluginSettingField } from './pluginApi'

/** What a worker sends the host. */
export type WorkerToHost =
  /** Subscribe to an app event; the host forwards matching events back. */
  | { k: 'subscribe'; event: string }
  /** Emit an app event (core note/link/annotation events are refused). */
  | { k: 'emit'; event: string; payload: unknown }
  /** Call a host API. `ns` is the capability, `fn` the method. */
  | { k: 'rpc'; id: number; ns: string; fn: string; args: unknown[] }
  /** Contribute a command-palette entry. */
  | { k: 'command'; id: string; label: string; icon?: string; hint?: string; hotkey?: string }
  /** Declare (or replace) a right-rail panel as data — a worker can't render, so
   *  it describes the panel and the host draws it. */
  | { k: 'panel'; id: string; title: string; blocks: unknown }
  /** Claim a fenced code language; the host will ask for a render per fence. */
  | { k: 'fence'; lang: string }
  /** Contribute a theme (validated host-side before it reaches the Theme Studio). */
  | { k: 'theme'; theme: unknown }
  /** Set (or, with `null`, clear) the animated backdrop. */
  | { k: 'background'; background: unknown }
  /** Answer to a `render` request: the blocks for one fence. */
  | { k: 'renderResult'; id: number; ok: true; blocks: unknown }
  | { k: 'renderResult'; id: number; ok: false; error: string }
  /** Declare a settings pane (rendered by the host, since a worker has no UI). */
  | { k: 'settings'; fields: PluginSettingField[] }
  /** Write a line to the Plugin Console. */
  | { k: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  /** `init(ctx)` returned without throwing. */
  | { k: 'ready' }
  /** The plugin failed to load or initialize; the host unregisters it. */
  | { k: 'fatal'; message: string }
  /** `destroy()` has run — safe to terminate. */
  | { k: 'bye' }
  /** Answer to a heartbeat; proves the worker's event loop is still turning. */
  | { k: 'pong'; n: number }

/** What the host sends a worker. */
export type HostToWorker =
  /** Always first: the plugin's id and the permissions it was granted. */
  | { k: 'init'; pluginId: string; granted: string[] }
  | { k: 'event'; event: string; payload: unknown }
  | { k: 'rpcResult'; id: number; ok: true; value: unknown }
  | { k: 'rpcResult'; id: number; ok: false; error: string }
  /** Run a command this worker registered. */
  | { k: 'run'; commandId: string }
  /** The user changed this plugin's settings. */
  | { k: 'settingsChanged'; values: Record<string, unknown> }
  /** A button in one of this plugin's block panels was pressed. */
  | { k: 'action'; panelId: string; actionId: string }
  /** Render one fenced block: the host is showing a note that contains it. */
  | { k: 'render'; id: number; lang: string; source: string }
  /** Shut down: run `destroy()`, then reply `bye`. */
  | { k: 'destroy' }
  /** Heartbeat — a worker stuck in a loop never answers. */
  | { k: 'ping'; n: number }

/**
 * The slice of `Worker` the host uses. A real `Worker` satisfies it; tests pass a
 * double.
 */
export interface WorkerLike {
  postMessage(message: HostToWorker): void
  terminate(): void
  onmessage: ((event: { data: WorkerToHost }) => void) | null
  onerror: ((event: { message?: string }) => void) | null
}

/** How long the host waits for `bye` before terminating anyway. */
export const DESTROY_GRACE_MS = 250

/** Heartbeat interval, and how many may go unanswered before the worker is
 *  considered stuck. `guard` paces plugins that *call* the host; a worker spinning
 *  in `while (true) {}` never calls anything, so only silence gives it away. */
export const HEARTBEAT_MS = 5000
export const HEARTBEAT_MISSES = 2

/** How long the host waits for a worker to render a fence before giving up and
 *  falling back to the plain code block. A note must never hang on a plugin. */
export const RENDER_TIMEOUT_MS = 3000
