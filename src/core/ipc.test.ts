// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-expect-error Node.js types not available in this project
import { readFileSync, readdirSync, statSync } from 'node:fs'
// @ts-expect-error Node.js types not available in this project
import { dirname, join, relative } from 'node:path'
// @ts-expect-error Node.js types not available in this project
import { fileURLToPath } from 'node:url'

const core = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => core)

import { invoke } from './ipc'
import { clearLogEntries, getLogEntries, setLogSettings } from '../lib/logger'

beforeEach(() => {
  core.invoke.mockReset()
  setLogSettings({ dev: 'trace' })
  clearLogEntries()
})

describe('ipc.invoke', () => {
  it('forwards exactly the caller arguments and returns the result', async () => {
    core.invoke.mockResolvedValue(42)
    await expect(invoke('get_note', { id: 'n1' })).resolves.toBe(42)
    expect(core.invoke).toHaveBeenCalledWith('get_note', { id: 'n1' })
    expect(core.invoke.mock.calls[0]).toHaveLength(2)
    const e = getLogEntries().slice(-1)[0]!
    expect(e).toMatchObject({ level: 'trace', category: 'ipc', message: 'get_note', event: 'ok' })
    expect(e.data).toBeUndefined() // arguments are never logged
  })

  it('logs a failure at debug with the error, then rethrows it', async () => {
    core.invoke.mockRejectedValue('Note not found')
    await expect(invoke('get_note', { id: 'x' })).rejects.toBe('Note not found')
    expect(getLogEntries().slice(-1)[0]).toMatchObject({ level: 'debug', event: 'fail', message: 'get_note failed', error: { message: 'Note not found' } })
  })

  it('records nothing for a fast success when developer logging is off', async () => {
    setLogSettings({ dev: 'off' })
    clearLogEntries()
    core.invoke.mockResolvedValue(null)
    await invoke('ping')
    expect(getLogEntries()).toEqual([])
  })
})

describe('ipc wrapper adoption', () => {
  it('is the only place that imports invoke from @tauri-apps/api/core', () => {
    // A direct import silently skips IPC tracing; route it through core/ipc.ts.
    const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
    const sources = (dir: string): string[] =>
      readdirSync(dir).flatMap((name: string) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return sources(path)
        return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : []
      })
    const offenders = sources(srcRoot)
      .filter((path) => !path.endsWith(join('core', 'ipc.ts')))
      .filter((path) => /import\s*\{[^}]*\binvoke\b[^}]*\}\s*from\s*'@tauri-apps\/api\/core'/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(srcRoot, path))
    expect(offenders).toEqual([])
  })
})
