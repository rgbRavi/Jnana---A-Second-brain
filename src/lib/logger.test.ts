// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const file = vi.hoisted(() => ({
  trace: vi.fn(() => Promise.resolve()),
  debug: vi.fn(() => Promise.resolve()),
  info: vi.fn(() => Promise.resolve()),
  warn: vi.fn(() => Promise.resolve()),
  error: vi.fn(() => Promise.resolve()),
  attachLogger: vi.fn(() => Promise.resolve(() => {})),
}))
vi.mock('@tauri-apps/plugin-log', () => file)

import {
  log,
  logEvent,
  redact,
  getLogEntries,
  clearLogEntries,
  setLogSettings,
  ingestRustRecord,
  isLogLevelEnabled,
} from './logger'

const last = () => getLogEntries()[getLogEntries().length - 1]

beforeEach(() => {
  ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  setLogSettings({ dev: 'off', file: 'info' })
  clearLogEntries()
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  vi.restoreAllMocks()
})

describe('redact', () => {
  it('masks bearer tokens, provider keys, key=value secrets and the OS user name', () => {
    const out = redact(
      'Authorization: Bearer abcdefghijklmnop sk-proj-AAAABBBBCCCCDDDD url?api_key=XYZ123&x=1 password: hunter2 C:\\Users\\alice\\notes /home/bob/x',
    )
    expect(out).not.toMatch(/abcdefghijklmnop|AAAABBBB|XYZ123|hunter2|alice|bob/)
    expect(out).toContain('x=1')
  })

  it('leaves ordinary text alone', () => {
    expect(redact('Imported 3 notes (tokens: 120)')).toBe('Imported 3 notes (tokens: 120)')
  })
})

describe('logEvent', () => {
  it('stores a structured, redacted entry', () => {
    logEvent('info', 'data', 'Saved', {
      event: 'save',
      opId: 'op-1',
      durationMs: 12.6,
      data: { id: 'n1', apiKey: 'sk-live-123456789012345', content: 'my private diary', nested: { password: 'x' } },
    })
    const e = last()
    expect(e).toMatchObject({ level: 'info', source: 'app', category: 'data', event: 'save', opId: 'op-1', durationMs: 13 })
    expect(e.data).toContain('"id":"n1"')
    expect(e.data).not.toMatch(/sk-live|private diary|"password":"x"/)
    expect(e.data).toContain('[16 chars]')
  })

  it('keeps info+ when developer logging is off, drops debug/trace', () => {
    logEvent('debug', 'ipc', 'quiet')
    logEvent('trace', 'ipc', 'quieter')
    logEvent('error', 'data', 'loud')
    expect(getLogEntries().map((e) => e.message)).toEqual(['loud'])
    expect(isLogLevelEnabled('debug')).toBe(false)
  })

  it('keeps debug (not trace) at dev=debug, everything at dev=trace', () => {
    setLogSettings({ dev: 'debug' })
    clearLogEntries()
    logEvent('debug', 'ipc', 'a')
    logEvent('trace', 'ipc', 'b')
    setLogSettings({ dev: 'trace' })
    logEvent('trace', 'ipc', 'c')
    expect(getLogEntries().map((e) => e.message)).toEqual(['a', expect.stringContaining('developer=trace'), 'c'])
  })

  it('writes info+ to the log file, never debug, and warn+ only at file=warn', () => {
    setLogSettings({ dev: 'trace' })
    vi.clearAllMocks()
    logEvent('debug', 'x', 'dbg')
    logEvent('info', 'x', 'inf')
    logEvent('error', 'x', 'err', { error: new Error('boom') })
    expect(file.debug).not.toHaveBeenCalled()
    expect(file.info).toHaveBeenCalledWith(expect.stringContaining('[app:x] inf'))
    expect(file.error).toHaveBeenCalledWith(expect.stringContaining('Error: boom'))
    setLogSettings({ file: 'warn' })
    vi.clearAllMocks()
    logEvent('info', 'x', 'inf2')
    expect(file.info).not.toHaveBeenCalled()
  })

  it('still records when the log file is unavailable', () => {
    file.error.mockImplementationOnce(() => Promise.reject(new Error('disk gone')))
    expect(() => logEvent('error', 'x', 'still here')).not.toThrow()
    expect(last().message).toBe('still here')
  })

  it('bounds the in-memory log', () => {
    for (let i = 0; i < 2100; i++) logEvent('info', 'x', `m${i}`, { persist: false })
    const all = getLogEntries()
    expect(all.length).toBe(2000)
    expect(all[all.length - 1].message).toBe('m2099')
  })

  it('never throws on unserializable data', () => {
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(() => logEvent('info', 'x', 'loop', { data: { loop, big: 10n } })).not.toThrow()
    expect(last().data).toContain('[circular]')
  })
})

describe('log (back-compat)', () => {
  it('turns an Error argument into error details and the rest into data', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    log.error('trash purge failed', new Error('locked'), { days: 30 })
    expect(last()).toMatchObject({ level: 'error', category: 'app', message: 'trash purge failed' })
    expect(last().error?.message).toBe('locked')
    expect(last().data).toBe('{"days":30}')
  })
})

describe('log.span', () => {
  it('records duration and a shared opId, and rethrows failures', async () => {
    setLogSettings({ dev: 'debug' })
    clearLogEntries()
    await expect(log.span('data', 'Backup', async () => 'ok')).resolves.toBe('ok')
    const [start, end] = getLogEntries()
    expect(start.event).toBe('start')
    expect(end).toMatchObject({ event: 'end', level: 'info', message: 'Backup', opId: start.opId })
    expect(end.durationMs).toBeGreaterThanOrEqual(0)

    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(log.span('data', 'Restore', async () => Promise.reject(new Error('bad zip')))).rejects.toThrow('bad zip')
    expect(last()).toMatchObject({ event: 'fail', level: 'error', message: 'Restore failed' })
    expect(last().error?.message).toBe('bad zip')
  })
})

describe('ingestRustRecord', () => {
  it('parses the tauri-plugin-log line into a rust entry without re-writing the file', () => {
    vi.clearAllMocks()
    ingestRustRecord(4, '[2026-11-12][10:00:00][jnana::commands::data][WARN] create_backup: slow')
    expect(last()).toMatchObject({ source: 'rust', level: 'warn', category: 'commands::data', message: 'create_backup: slow' })
    expect(file.warn).not.toHaveBeenCalled()
  })
})
