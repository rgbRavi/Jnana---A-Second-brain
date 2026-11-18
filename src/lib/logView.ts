// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure helpers behind the Developer Log viewer: filtering and export text. Kept
// out of the component so they are tested without a React tree.

import type { LogEntry, LogLevel, LogSource } from './logger'

export const LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
const RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i])) as Record<LogLevel, number>

export interface LogFilter {
  minLevel: LogLevel
  source: LogSource | 'all'
  /** '' = any. */
  category: string
  /** '' = any. */
  pluginId: string
  /** Only entries newer than this many ms; 0 = all time. */
  withinMs: number
  /** Case-insensitive; matches message, category, event, opId, plugin, data and error. */
  query: string
}

export const DEFAULT_FILTER: LogFilter = {
  minLevel: 'trace',
  source: 'all',
  category: '',
  pluginId: '',
  withinMs: 0,
  query: '',
}

export function filterLogEntries(entries: LogEntry[], f: LogFilter, now = Date.now()): LogEntry[] {
  const q = f.query.trim().toLowerCase()
  const min = RANK[f.minLevel]
  const since = f.withinMs > 0 ? now - f.withinMs : 0
  return entries.filter((e) => {
    if (RANK[e.level] < min) return false
    if (f.source !== 'all' && e.source !== f.source) return false
    if (f.category && e.category !== f.category) return false
    if (f.pluginId && e.pluginId !== f.pluginId) return false
    if (since && e.ts < since) return false
    if (!q) return true
    return [e.message, e.category, e.event, e.opId, e.pluginId, e.data, e.error?.message, e.error?.stack]
      .some((s) => s?.toLowerCase().includes(q))
  })
}

/** Distinct values for the category / plugin pickers, sorted. */
export function distinct(entries: LogEntry[], pick: (e: LogEntry) => string | undefined): string[] {
  const set = new Set<string>()
  for (const e of entries) {
    const v = pick(e)
    if (v) set.add(v)
  }
  return [...set].sort()
}

/** One entry as plain text (copy / export). Everything in it was redacted at record time. */
export function formatEntry(e: LogEntry): string {
  const head = [
    new Date(e.ts).toISOString(),
    e.level.toUpperCase().padEnd(5),
    `${e.source}:${e.category}${e.pluginId ? `:${e.pluginId}` : ''}`,
    e.message,
  ].join(' ')
  const lines = [head]
  const meta = [e.event && `event=${e.event}`, e.opId && `op=${e.opId}`, e.durationMs !== undefined && `${e.durationMs}ms`]
    .filter(Boolean)
    .join(' ')
  if (meta) lines.push(`    ${meta}`)
  if (e.data) lines.push(`    data: ${e.data}`)
  if (e.error) {
    lines.push(`    error: ${e.error.name}: ${e.error.message}`)
    if (e.error.stack) lines.push(...e.error.stack.split('\n').map((l) => `      ${l}`))
  }
  return lines.join('\n')
}

export function formatExport(entries: LogEntry[], diagnostics: string): string {
  return [
    '# Jnana log export',
    '# Secrets, note text and the OS user name are redacted — review before sharing anyway.',
    diagnostics
      .split('\n')
      .map((l) => `# ${l}`)
      .join('\n'),
    '',
    ...entries.map(formatEntry),
    '',
  ].join('\n')
}
