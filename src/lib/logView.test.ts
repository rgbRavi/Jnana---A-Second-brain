// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import type { LogEntry } from './logger'
import { DEFAULT_FILTER, distinct, filterLogEntries, formatEntry, formatExport } from './logView'

const NOW = 1_000_000_000
const e = (p: Partial<LogEntry>): LogEntry => ({ id: 1, ts: NOW, level: 'info', source: 'app', category: 'app', message: 'm', ...p })

const entries: LogEntry[] = [
  e({ id: 1, level: 'trace', category: 'ipc', message: 'save_note', ts: NOW - 10 * 60_000 }),
  e({ id: 2, level: 'warn', category: 'plugin', pluginId: 'pomodoro', source: 'plugin', message: 'tick slow' }),
  e({ id: 3, level: 'error', category: 'data', message: 'Backup failed', opId: 'data-x-1', error: { name: 'Error', message: 'disk full' } }),
  e({ id: 4, level: 'info', source: 'rust', category: 'db::schema', message: 'migrated' }),
]
const ids = (f: Partial<typeof DEFAULT_FILTER>) => filterLogEntries(entries, { ...DEFAULT_FILTER, ...f }, NOW).map((x) => x.id)

describe('filterLogEntries', () => {
  it('filters by level, source, category, plugin and time', () => {
    expect(ids({})).toEqual([1, 2, 3, 4])
    expect(ids({ minLevel: 'warn' })).toEqual([2, 3])
    expect(ids({ source: 'rust' })).toEqual([4])
    expect(ids({ category: 'data' })).toEqual([3])
    expect(ids({ pluginId: 'pomodoro' })).toEqual([2])
    expect(ids({ withinMs: 5 * 60_000 })).toEqual([2, 3, 4])
  })

  it('searches message, error text and correlation id, case-insensitively', () => {
    expect(ids({ query: 'DISK' })).toEqual([3])
    expect(ids({ query: 'data-x-1' })).toEqual([3])
    expect(ids({ query: 'nothing' })).toEqual([])
  })
})

describe('distinct', () => {
  it('lists unique values, sorted', () => {
    expect(distinct(entries, (x) => x.category)).toEqual(['data', 'db::schema', 'ipc', 'plugin'])
    expect(distinct(entries, (x) => x.pluginId)).toEqual(['pomodoro'])
  })
})

describe('formatting', () => {
  it('formats an entry with its context and error', () => {
    const text = formatEntry(entries[2])
    expect(text).toContain('ERROR app:data Backup failed')
    expect(text).toContain('op=data-x-1')
    expect(text).toContain('error: Error: disk full')
  })

  it('prefixes the export with a redaction notice and diagnostics', () => {
    const text = formatExport(entries.slice(0, 1), 'Jnana 0.1.0\nUser agent: x')
    expect(text.split('\n').slice(0, 4)).toEqual([
      '# Jnana log export',
      expect.stringContaining('redacted'),
      '# Jnana 0.1.0',
      '# User agent: x',
    ])
  })
})
