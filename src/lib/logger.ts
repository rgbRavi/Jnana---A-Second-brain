// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/lib/logger.ts — the one logging pipeline (see docs/logging.md).
//
// Every entry is a structured `LogEntry` that goes to up to three places:
//   1. the in-memory ring (MAX_ENTRIES) behind Settings → Developer → Developer Log
//      and the Plugin Console;
//   2. the rotating log file, via tauri-plugin-log (Rust owns the file);
//   3. the devtools console.
//
//   import { log, logEvent } from './logger'
//   log.info('backup started', { dest })                 // back-compat form
//   logEvent('warn', 'sync', 'link sync slow', { durationMs, opId })
//   await log.span('data', 'Backup', () => createBackup(dest))
//
// Levels: info and above are ALWAYS kept and written to the file — turning
// developer logging off never hides an operational error. Developer verbosity
// (`off | debug | trace`) only decides whether the chattier debug/trace entries
// (IPC calls, events, routes) are kept in memory too.
//
// Everything is redacted before it is stored anywhere (keys, tokens, passwords,
// note bodies, the OS user name in paths), so an exported log is shareable.
//
// Rust-side records reach the ring through tauri-plugin-log's Webview target
// (`attachLogger`); main.rs filters webview-originated records out of that
// target, so a frontend line never comes back as a duplicate "rust" line.
//
// Recursion safety: the original console methods are captured up front; the
// logger prints through those (never the patched console), so the console tee
// can't loop.

import { trace, debug, info, warn, error, attachLogger } from '@tauri-apps/plugin-log'

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
/** Who produced the entry: the app itself, a plugin's own `ctx.log`/errors, or Rust. */
export type LogSource = 'app' | 'plugin' | 'rust'
/** How much of the chatty developer detail the in-memory log keeps. */
export type DevLogLevel = 'off' | 'debug' | 'trace'
/** Lowest level written to the log file. */
export type FileLogLevel = 'info' | 'warn'

export interface LogError {
  name: string
  message: string
  stack?: string
}

export interface LogEntry {
  id: number
  ts: number
  level: LogLevel
  source: LogSource
  /** Subsystem: app, lifecycle, nav, ipc, event, data, plugin, ai, perf, … (Rust: its target). */
  category: string
  /** Machine-friendly event name (`start`, `end`, `fail`, `install`, …), when one applies. */
  event?: string
  message: string
  pluginId?: string
  /** Ties together the entries of one operation (a span, an IPC call). */
  opId?: string
  durationMs?: number
  /** Redacted JSON of the structured context. */
  data?: string
  error?: LogError
}

export interface LogContext {
  event?: string
  data?: unknown
  error?: unknown
  pluginId?: string
  opId?: string
  durationMs?: number
  source?: LogSource
  /** Force (true) or skip (false) the log-file write; default: level ≥ file level. */
  persist?: boolean
}

const MAX_ENTRIES = 2000
const MAX_MESSAGE = 2000
const MAX_DATA = 4000
const SETTINGS_KEY = 'jnana.logging.v1'

const RANK: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 }

const orig = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
}

const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// ─── Redaction ────────────────────────────────────────────────────────────────

/** Object keys whose values are secrets — never stored. */
const SECRET_KEY = /pass(word|wd|phrase)?$|secret|token$|api[-_]?key|apikey|authorization|cookie|credential|private[-_]?key/i
/** Object keys that carry user content — stored as a length only. */
const CONTENT_KEY = /^(content|body|text|markdown|html|bytes|prompt|messages)$/i

const PATTERNS: Array<[RegExp, string]> = [
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]'],
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, '$1-[redacted]'],
  [
    /((?:api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|token|secret|password|passwd|authorization|x-api-key)\s*["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi,
    '$1[redacted]',
  ],
  // OS user name inside home-dir paths: C:\Users\<name>\…, /Users/<name>/…, /home/<name>/…
  [/([\\/](?:Users|home)[\\/])[^\\/\s"']+/gi, '$1~'],
]

/** Mask secrets and personal path segments in free text. */
export function redact(text: string): string {
  let out = text
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep)
  return out
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  try {
    const json = JSON.stringify(value, (key, v: unknown) => {
      if (key && SECRET_KEY.test(key)) return '[redacted]'
      if (key && CONTENT_KEY.test(key)) {
        if (typeof v === 'string') return `[${v.length} chars]`
        if (Array.isArray(v)) return `[${v.length} items]`
        if (v && typeof v === 'object') return '[omitted]'
      }
      if (typeof v === 'bigint') return v.toString()
      if (v instanceof Error) return toLogError(v)
      if (v instanceof Uint8Array || v instanceof ArrayBuffer) return `[${v.byteLength} bytes]`
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[circular]'
        seen.add(v)
      }
      return v
    })
    return json === undefined ? String(value) : json
  } catch {
    return String(value)
  }
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}… [+${s.length - max} chars]` : s
}

/** Normalize anything thrown into a redacted `LogError`. */
export function toLogError(e: unknown): LogError {
  if (e instanceof Error) {
    return { name: e.name, message: redact(e.message), stack: e.stack ? redact(e.stack) : undefined }
  }
  if (typeof e === 'string') return { name: 'Error', message: redact(e) }
  if (e && typeof e === 'object' && 'message' in e) {
    return { name: 'Error', message: redact(String((e as { message: unknown }).message)) }
  }
  return { name: 'Error', message: redact(safeStringify(e)) }
}

// ─── Settings (verbosity) ─────────────────────────────────────────────────────

export interface LogSettings {
  dev: DevLogLevel
  file: FileLogLevel
}

const DEFAULT_SETTINGS: LogSettings = { dev: 'off', file: 'info' }

function loadSettings(): LogSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const p = JSON.parse(raw) as Partial<LogSettings>
    return {
      dev: p.dev === 'debug' || p.dev === 'trace' ? p.dev : 'off',
      file: p.file === 'warn' ? 'warn' : 'info',
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

let settings: LogSettings = loadSettings()
const settingsListeners = new Set<() => void>()

export function getLogSettings(): LogSettings {
  return settings
}

export function setLogSettings(patch: Partial<LogSettings>): void {
  settings = { ...settings, ...patch }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* storage unavailable — the setting lasts this session */
  }
  settingsListeners.forEach((l) => l())
  logEvent('info', 'logging', `Log verbosity: developer=${settings.dev}, file=${settings.file}`)
}

export function subscribeLogSettings(listener: () => void): () => void {
  settingsListeners.add(listener)
  return () => {
    settingsListeners.delete(listener)
  }
}

function keepThreshold(): number {
  return settings.dev === 'trace' ? RANK.trace : settings.dev === 'debug' ? RANK.debug : RANK.info
}

/** Cheap guard for callers that would otherwise build an expensive entry. */
export function isLogLevelEnabled(level: LogLevel): boolean {
  return RANK[level] >= keepThreshold()
}

// ─── Store ────────────────────────────────────────────────────────────────────

const buffer: LogEntry[] = []
let snapshot: LogEntry[] = []
let dirty = false
let seq = 0
const listeners = new Set<() => void>()

function notify(): void {
  dirty = true
  listeners.forEach((l) => {
    try {
      l()
    } catch {
      /* a broken viewer must not break logging */
    }
  })
}

/** Stable snapshot (identity changes only on mutation) for useSyncExternalStore. */
export function getLogEntries(): LogEntry[] {
  if (dirty) {
    snapshot = buffer.slice()
    dirty = false
  }
  return snapshot
}

export function subscribeLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Clear the in-memory log (all of it, or the entries matching `which`). The file is untouched. */
export function clearLogEntries(which?: (e: LogEntry) => boolean): void {
  if (!which) buffer.length = 0
  else {
    const keep = buffer.filter((e) => !which(e))
    buffer.length = 0
    buffer.push(...keep)
  }
  notify()
}

let opSeq = 0
/** Short id to correlate the entries of one operation. */
export function newOpId(prefix = 'op'): string {
  opSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${opSeq.toString(36)}`
}

const FILE_FN: Record<LogLevel, (m: string) => Promise<void>> = {
  trace,
  debug,
  info,
  warn,
  error,
  fatal: error,
}

function fileLine(e: LogEntry): string {
  const tag = e.pluginId ? `${e.category}:${e.pluginId}` : e.category
  const parts = [`[${e.source}:${tag}]`, e.message]
  if (e.event) parts.push(`event=${e.event}`)
  if (e.opId) parts.push(`op=${e.opId}`)
  if (e.durationMs !== undefined) parts.push(`${e.durationMs}ms`)
  if (e.data) parts.push(e.data)
  if (e.error) parts.push(`| ${e.error.name}: ${e.error.message}${e.error.stack ? `\n${e.error.stack}` : ''}`)
  return parts.join(' ')
}

interface RecordOpts {
  console?: boolean
}

function recordEntry(level: LogLevel, category: string, message: string, ctx: LogContext = {}, opts: RecordOpts = {}): void {
  try {
    const source = ctx.source ?? 'app'
    const keep = RANK[level] >= keepThreshold()
    const fileMin = settings.file === 'warn' ? RANK.warn : RANK.info
    const persist = source !== 'rust' && (ctx.persist ?? RANK[level] >= fileMin)
    if (!keep && !persist) return

    seq += 1
    const entry: LogEntry = {
      id: seq,
      ts: Date.now(),
      level,
      source,
      category,
      message: clip(redact(message), MAX_MESSAGE),
    }
    if (ctx.event) entry.event = ctx.event
    if (ctx.pluginId) entry.pluginId = ctx.pluginId
    if (ctx.opId) entry.opId = ctx.opId
    if (ctx.durationMs !== undefined) entry.durationMs = Math.round(ctx.durationMs)
    if (ctx.data !== undefined) entry.data = clip(redact(safeStringify(ctx.data)), MAX_DATA)
    if (ctx.error !== undefined && ctx.error !== null && ctx.error !== '') entry.error = toLogError(ctx.error)

    if (keep) {
      buffer.push(entry)
      if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES)
      notify()
    }
    if (opts.console !== false && source !== 'rust') {
      const fn = RANK[level] >= RANK.error ? orig.error : level === 'warn' ? orig.warn : level === 'info' ? orig.info : orig.debug
      fn(`[${category}${entry.pluginId ? `:${entry.pluginId}` : ''}] ${entry.message}`, ...[entry.data, entry.error].filter(Boolean))
    }
    if (persist && inTauri()) {
      void FILE_FN[level](fileLine(entry)).catch(() => {
        /* the file is best-effort; the ring and console still have it */
      })
    }
  } catch {
    /* logging must never throw into the caller */
  }
}

/** Structured log entry. */
export function logEvent(level: LogLevel, category: string, message: string, ctx?: LogContext): void {
  recordEntry(level, category, message, ctx)
}

/** Back-compat: `log.x(msg, ...extra)` — Errors become `error`, the rest `data`. */
function fromExtra(extra: unknown[]): LogContext {
  if (extra.length === 0) return {}
  const err = extra.find((x) => x instanceof Error)
  const rest = extra.filter((x) => x !== err && x !== '' && x !== undefined)
  return {
    error: err,
    data: rest.length === 0 ? undefined : rest.length === 1 ? rest[0] : rest,
  }
}

interface SpanOptions extends LogContext {
  /** Level of the success entry (default info; use debug for frequent operations). */
  level?: LogLevel
}

/**
 * Time an async operation: a debug `start`, then an `end` (with duration) or an
 * error `fail` entry, all sharing one opId. Rethrows — callers still handle it.
 */
async function span<T>(category: string, message: string, run: (opId: string) => Promise<T>, opts: SpanOptions = {}): Promise<T> {
  const { level = 'info', ...ctx } = opts
  const opId = ctx.opId ?? newOpId(category)
  const t0 = performance.now()
  recordEntry('debug', category, `${message} started`, { ...ctx, opId, event: 'start' })
  try {
    const result = await run(opId)
    recordEntry(level, category, message, { ...ctx, opId, event: 'end', durationMs: performance.now() - t0 })
    return result
  } catch (e) {
    recordEntry('error', category, `${message} failed`, { ...ctx, opId, event: 'fail', error: e, durationMs: performance.now() - t0 })
    throw e
  }
}

/** A `ctx.log`-shaped logger for one category — what shared components take so a
 *  plugin can hand in its own `ctx.log` instead (then lines carry its plugin id).
 *  An Error passed as `data` becomes the entry's error. */
export interface ScopedLog {
  debug(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
}

export function scopedLog(category: string): ScopedLog {
  const at = (level: LogLevel) => (message: string, data?: unknown) =>
    recordEntry(level, category, message, data instanceof Error ? { error: data } : { data })
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') }
}

/** App logger. Writes to the in-app log, the rotating log file and the console. */
export const log = {
  trace: (msg: string, ...extra: unknown[]) => recordEntry('trace', 'app', msg, fromExtra(extra)),
  debug: (msg: string, ...extra: unknown[]) => recordEntry('debug', 'app', msg, fromExtra(extra)),
  info: (msg: string, ...extra: unknown[]) => recordEntry('info', 'app', msg, fromExtra(extra)),
  warn: (msg: string, ...extra: unknown[]) => recordEntry('warn', 'app', msg, fromExtra(extra)),
  error: (msg: string, ...extra: unknown[]) => recordEntry('error', 'app', msg, fromExtra(extra)),
  fatal: (msg: string, ...extra: unknown[]) => recordEntry('fatal', 'app', msg, fromExtra(extra)),
  event: logEvent,
  span,
}

// ─── Rust ingestion ───────────────────────────────────────────────────────────

const RUST_LEVELS: LogLevel[] = ['trace', 'trace', 'debug', 'info', 'warn', 'error']
// tauri-plugin-log's default line: `[date][time][target][LEVEL] message`
const RUST_LINE = /^(?:\[[^\]]*\]){2}\[([^\]]*)\]\[[A-Z]+\] ([\s\S]*)$/

/** Turn one tauri-plugin-log Webview-target record into a ring entry. Exported for tests. */
export function ingestRustRecord(level: number, raw: string): void {
  const m = RUST_LINE.exec(raw)
  // Category = the Rust module path minus the crate (`commands::data`, `db::schema`).
  const category = m ? m[1].replace(/^jnana::/, '') || 'rust' : 'rust'
  recordEntry(RUST_LEVELS[level] ?? 'info', category, m ? m[2] : raw, { source: 'rust' })
}

// ─── Install ──────────────────────────────────────────────────────────────────

let initialized = false

function stringifyArgs(args: unknown[]): string {
  return args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? `${a.name}: ${a.message}` : safeStringify(a))).join(' ')
}

/**
 * Install the console tee, global error handlers and the Rust log listener.
 * Idempotent so StrictMode's double-invoke (and any accidental re-call) is safe.
 */
export function initLogging(): void {
  if (initialized) return
  initialized = true

  // Existing console.error/warn calls still print unchanged (via the saved
  // original) and are also recorded + written to the file.
  const tee =
    (level: 'warn' | 'error', original: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      original(...args)
      const err = args.find((a) => a instanceof Error)
      recordEntry(level, 'console', stringifyArgs(args.filter((a) => a !== err)) || String(err), { error: err }, { console: false })
    }
  console.error = tee('error', orig.error)
  console.warn = tee('warn', orig.warn)

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
      recordEntry('error', 'lifecycle', `Uncaught error: ${e.message}`, { event: 'uncaught', error: e.error ?? e.message })
    })
    window.addEventListener('unhandledrejection', (e) => {
      recordEntry('error', 'lifecycle', 'Unhandled promise rejection', { event: 'unhandled-rejection', error: e.reason })
    })
  }

  if (inTauri()) {
    void attachLogger(({ level, message }) => ingestRustRecord(level, message)).catch(() => {
      /* no Rust log stream — the file still has those lines */
    })
  }
}
