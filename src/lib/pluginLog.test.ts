// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }))

import { pluginRegistry } from './pluginRegistry'
import { pluginLog, pluginWrite, getPluginLog, clearPluginLog } from './pluginLog'
import { getLogEntries, clearLogEntries, logEvent, setLogSettings } from './logger'
import { resetPluginBudget } from '../core/plugins/guard'
import type { PluginContext } from './pluginApi'

beforeEach(() => {
  setLogSettings({ dev: 'debug' })
  clearLogEntries()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
})

afterEach(() => {
  pluginRegistry.unregister('t.logger')
  resetPluginBudget('t.logger')
  vi.restoreAllMocks()
})

describe('pluginLog view', () => {
  it('is a stable, plugin-only view over the app log', () => {
    pluginLog('info', 'Loaded v1', 'a')
    const first = getPluginLog()
    logEvent('info', 'data', 'unrelated app entry')
    expect(getPluginLog()).toBe(first) // an app line doesn't churn the console
    expect(first.map((e) => e.message)).toEqual(['Loaded v1'])
    expect(getLogEntries().find((e) => e.message === 'Loaded v1')).toMatchObject({ source: 'app', category: 'plugin', pluginId: 'a' })
  })

  it('clearing the Plugin Console leaves app entries alone', () => {
    pluginLog('warn', 'x', 'a')
    logEvent('info', 'data', 'keep me')
    clearPluginLog()
    expect(getPluginLog()).toEqual([])
    expect(getLogEntries().map((e) => e.message)).toEqual(['keep me'])
  })
})

describe('pluginWrite (trust boundary)', () => {
  it('marks the line as plugin-written, validates the level and caps the text', () => {
    pluginWrite('w', 'root', 'x'.repeat(5000), { token: 'secret-value' })
    const e = getLogEntries()[getLogEntries().length - 1]
    expect(e).toMatchObject({ source: 'plugin', pluginId: 'w', level: 'info' })
    expect(e.message.length).toBe(1000)
    expect(e.data).not.toContain('secret-value')
  })
})

describe('ctx.log', () => {
  it('is write-only and charged to the plugin budget', () => {
    let ctx: PluginContext | undefined
    pluginRegistry.register({ id: 't.logger', name: 'T', version: '1.0.0', init: (c) => void (ctx = c) }, { grantedPermissions: [] })
    expect(Object.keys(ctx!.log).sort()).toEqual(['debug', 'error', 'info', 'warn'])
    clearLogEntries()
    for (let i = 0; i < 250; i++) ctx!.log.info(`line ${i}`)
    const lines = getLogEntries().filter((e) => e.source === 'plugin' && e.pluginId === 't.logger')
    expect(lines.length).toBeGreaterThan(50)
    expect(lines.length).toBeLessThan(250) // the rate limiter dropped the flood
  })
})

describe('built-in plugins (canvas, quiz) log as themselves', () => {
  it('a bound slot writes plugin-tagged lines; unbound drops them', async () => {
    const { pluginLogSlot } = await import('./pluginLog')
    const slot = pluginLogSlot()
    slot.info('dropped while unbound')
    expect(getLogEntries()).toEqual([])
    const sink = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    slot.bind(sink)
    slot.warn('hi', { a: 1 })
    expect(sink.warn).toHaveBeenCalledWith('hi', { a: 1 })
  })

  it('canvas: unreadable content is warned once, attributed to jnana.canvas', async () => {
    // The real canvas plugin pulls in pdf.js (no DOMMatrix in jsdom); a stand-in
    // with its id binds the same slot the same way its init does.
    const CANVAS_PLUGIN_ID = 'jnana.canvas'
    const { canvasLog, checkCanvasContent } = await import('../plugins/canvas/log')
    pluginRegistry.unregister(CANVAS_PLUGIN_ID)
    pluginRegistry.register({ id: CANVAS_PLUGIN_ID, name: 'Canvas', version: '1.0.0', init: (c) => canvasLog.bind(c.log) })
    clearLogEntries()
    checkCanvasContent('n-bad', '{oops')
    checkCanvasContent('n-bad', '{oops')
    const lines = getLogEntries().filter((e) => e.pluginId === CANVAS_PLUGIN_ID)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ level: 'warn', source: 'plugin', message: expect.stringContaining('unreadable') })
    pluginRegistry.unregister(CANVAS_PLUGIN_ID)
  })

  it('quiz: an Error passed as data becomes the entry error', async () => {
    const { quizPlugin, QUIZ_PLUGIN_ID } = await import('../plugins/quiz')
    const { quizLog } = await import('../plugins/quiz/log')
    pluginRegistry.unregister(QUIZ_PLUGIN_ID)
    pluginRegistry.register(quizPlugin)
    clearLogEntries()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    quizLog.error('Grading failed', new Error('provider 401'))
    const e = getLogEntries().find((x) => x.pluginId === QUIZ_PLUGIN_ID)!
    expect(e).toMatchObject({ level: 'error', source: 'plugin', message: 'Grading failed' })
    expect(e.error?.message).toBe('provider 401')
    pluginRegistry.unregister(QUIZ_PLUGIN_ID)
  })
})
