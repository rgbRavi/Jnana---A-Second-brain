// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The host half of the worker runtime: what a worker plugin is allowed to do.
// jsdom has no Worker, so these drive the registry with a double that records the
// messages the host sends back — which is the part that matters, since every
// capability a worker has is one the host chose to answer.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pluginRegistry } from './pluginRegistry'
import { eventBus } from './eventBus'
import { listCommands, getSettingsDefinition, listBlockPanels, getFence } from './pluginContributions'
import { getPluginBackground, listPluginThemes } from './pluginThemes'
import { HEARTBEAT_MS, HEARTBEAT_MISSES, RENDER_TIMEOUT_MS } from './pluginWorkerProtocol'
import { isPluginEnabled, setPluginEnabledState } from './pluginEnabled'
import type { HostToWorker, WorkerLike, WorkerToHost } from './pluginWorkerProtocol'

vi.mock('../core/plugins/storage', () => ({
  makePluginStorage: (pluginId: string) => ({
    get: async (key: string) => `${pluginId}:${key}`,
    set: async () => undefined,
    delete: async () => undefined,
    list: async () => ({}),
  }),
}))

vi.mock('../core/plugins/mediaApi', () => ({
  makePluginMediaApi: () => ({
    list: async () => [{ kind: 'image', label: 'a.png', source: 'asset', target: 'a.png' }],
    read: async () => new Uint8Array([1, 2]),
    write: async () => 'written.png',
  }),
}))

vi.mock('../core/plugins/notesApi', () => ({
  makePluginNotesApi: () => ({
    getAll: async () => [{ id: 'n1' }],
    getById: async () => undefined,
    search: async () => [],
    create: async () => ({ id: 'n2' }),
    saveContent: async () => undefined,
  }),
}))

class FakeWorker implements WorkerLike {
  sent: HostToWorker[] = []
  terminated = false
  onmessage: ((event: { data: WorkerToHost }) => void) | null = null
  onerror: ((event: { message?: string }) => void) | null = null

  postMessage(message: HostToWorker) {
    this.sent.push(message)
  }

  terminate() {
    this.terminated = true
  }

  /** Pretend the worker said something. */
  say(message: WorkerToHost) {
    this.onmessage?.({ data: message })
  }

  /** The reply to RPC `id`, once the host's promise has settled. */
  async reply(id: number) {
    await vi.waitFor(() => {
      expect(this.sent.some((m) => m.k === 'rpcResult' && m.id === id)).toBe(true)
    })
    return this.sent.find((m) => m.k === 'rpcResult' && m.id === id) as Extract<
      HostToWorker,
      { k: 'rpcResult' }
    >
  }
}

const meta = (granted: string[] = []) => ({
  id: 'com.test.worker',
  name: 'Test Worker',
  version: '1.0.0',
  granted,
})

describe('worker plugin runtime', () => {
  beforeEach(() => {
    pluginRegistry.unregister('com.test.worker')
  })

  it('hands the worker its id and grant, and answers scoped storage calls', async () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(['notes']), w)

    expect(w.sent[0]).toEqual({ k: 'init', pluginId: 'com.test.worker', granted: ['notes'] })
    expect(pluginRegistry.isRegistered('com.test.worker')).toBe(true)

    w.say({ k: 'rpc', id: 1, ns: 'storage', fn: 'get', args: ['seen'] })
    // Storage is bound to this plugin's id host-side — the worker can't name another.
    expect(await w.reply(1)).toMatchObject({ ok: true, value: 'com.test.worker:seen' })
  })

  it('refuses notes calls when the permission was not granted', async () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta([]), w)

    w.say({ k: 'rpc', id: 7, ns: 'notes', fn: 'getAll', args: [] })

    const reply = await w.reply(7)
    expect(reply.ok).toBe(false)
    expect(reply).toMatchObject({ error: expect.stringContaining('notes permission') })
  })

  it('answers the whole notes surface when it was granted', async () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(['notes']), w)

    w.say({ k: 'rpc', id: 10, ns: 'notes', fn: 'search', args: ['plan'] })
    w.say({ k: 'rpc', id: 11, ns: 'notes', fn: 'create', args: ['New', 'body'] })

    expect((await w.reply(10)).ok).toBe(true)
    expect((await w.reply(11)).ok).toBe(true)
  })

  it('answers notes calls when it was granted', async () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(['notes']), w)

    w.say({ k: 'rpc', id: 2, ns: 'notes', fn: 'getAll', args: [] })

    expect(await w.reply(2)).toMatchObject({ ok: true, value: [{ id: 'n1' }] })
  })

  it('refuses an unknown API instead of ignoring it', async () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(['notes']), w)

    w.say({ k: 'rpc', id: 3, ns: 'fs', fn: 'readFile', args: ['/etc/passwd'] })

    expect(await w.reply(3)).toMatchObject({ ok: false, error: 'Unknown plugin API "fs.readFile".' })
  })

  it('forwards subscribed events once, and blocks core events it tries to emit', () => {
    const w = new FakeWorker()
    const saved = vi.fn()
    eventBus.on('note:saved', saved)
    pluginRegistry.registerWorker(meta(), w)

    // Subscribing twice must not double-forward.
    w.say({ k: 'subscribe', event: 'workspace:changed' })
    w.say({ k: 'subscribe', event: 'workspace:changed' })
    eventBus.emit('workspace:changed', { id: 'w1' })
    expect(w.sent.filter((m) => m.k === 'event')).toHaveLength(1)

    // Forging a core event is refused; its own namespace is not.
    w.say({ k: 'emit', event: 'note:saved', payload: { id: 'n1' } })
    expect(saved).not.toHaveBeenCalled()

    eventBus.off('note:saved', saved)
  })

  it('surfaces commands and routes their run back to the worker', () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(), w)

    w.say({ k: 'command', id: 'test.ping', label: 'Ping' })
    const command = listCommands().find((c) => c.id === 'test.ping')
    expect(command?.label).toBe('Ping')

    command?.run()
    expect(w.sent).toContainEqual({ k: 'run', commandId: 'test.ping' })
  })

  it('renders a settings pane for a worker, and sends changes back to it', () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(), w)

    // A worker has no UI at all, so it declares its settings as data.
    w.say({ k: 'settings', fields: [{ key: 'city', label: 'City', type: 'text', default: 'Oslo' }] })
    const definition = getSettingsDefinition('com.test.worker')
    expect(definition?.fields[0]).toMatchObject({ key: 'city', type: 'text' })

    definition?.onChange?.({ city: 'Lisbon' })
    expect(w.sent).toContainEqual({ k: 'settingsChanged', values: { city: 'Lisbon' } })
  })


  it('refuses media calls without the permission, and answers them with it', async () => {
    const denied = new FakeWorker()
    pluginRegistry.registerWorker(meta(['notes']), denied)
    denied.say({ k: 'rpc', id: 20, ns: 'media', fn: 'list', args: ['n1'] })
    // `notes` does not carry attachments — a scan is not prose.
    expect(await denied.reply(20)).toMatchObject({ ok: false, error: expect.stringContaining('attachments') })
    pluginRegistry.unregister('com.test.worker')

    const allowed = new FakeWorker()
    pluginRegistry.registerWorker(meta(['media']), allowed)
    allowed.say({ k: 'rpc', id: 21, ns: 'media', fn: 'read', args: ['a.png'] })
    expect((await allowed.reply(21)).ok).toBe(true)
  })

  it('docks a block panel for a worker and routes its button presses back', () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(), w)

    w.say({ k: 'panel', id: 'test.panel', title: 'Test panel', blocks: [
      { type: 'text', text: 'hello' },
      { type: 'button', label: 'Go', actionId: 'go' },
      { type: 'html', text: '<script>x</script>' },
    ] })

    const panel = listBlockPanels().find((p) => p.id === 'test.panel')
    // The unknown block is dropped on the way in, not on the way out.
    expect(panel?.blocks).toHaveLength(2)

    panel?.onAction?.('go')
    expect(w.sent).toContainEqual({ k: 'action', panelId: 'test.panel', actionId: 'go' })

    pluginRegistry.unregister('com.test.worker')
    expect(listBlockPanels().find((p) => p.id === 'test.panel')).toBeUndefined()
  })

  it('renders a claimed fence by asking the worker, and gives up if it never answers', async () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(), w)

    w.say({ k: 'fence', lang: 'testlang' })
    const fence = getFence('testlang')
    expect(fence?.pluginId).toBe('com.test.worker')

    const pending = fence!.render('body')
    const request = w.sent.find((m) => m.k === 'render') as Extract<HostToWorker, { k: 'render' }>
    expect(request).toMatchObject({ lang: 'testlang', source: 'body' })

    w.say({ k: 'renderResult', id: request.id, ok: true, blocks: [{ type: 'text', text: 'rendered' }] })
    expect(await pending).toEqual([{ type: 'text', text: 'rendered' }])

    // A render that fails resolves to no blocks — the fence falls back to code.
    const second = fence!.render('again')
    const secondReq = [...w.sent].reverse().find((m) => m.k === 'render') as Extract<HostToWorker, { k: 'render' }>
    w.say({ k: 'renderResult', id: secondReq.id, ok: false, error: 'boom' })
    expect(await second).toEqual([])

    pluginRegistry.unregister('com.test.worker')
    expect(getFence('testlang')).toBeUndefined()
  })

  it('times out a fence the worker never answers, rather than hanging the note', async () => {
    vi.useFakeTimers()
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(), w)
    w.say({ k: 'fence', lang: 'slowlang' })

    const pending = getFence('slowlang')!.render('body')
    const assertion = expect(pending).rejects.toThrow(/too long/)
    await vi.advanceTimersByTimeAsync(RENDER_TIMEOUT_MS + 10)
    await assertion

    pluginRegistry.unregister('com.test.worker')
    vi.useRealTimers()
  })

  it('takes a theme and a backdrop from a worker, validated host-side', () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(), w)

    w.say({ k: 'theme', theme: { id: 'nord', name: 'Nord', base: 'dark', tokens: { '--bg': '#2e3440', '--accent': 'url(https://evil/x)' } } })
    w.say({ k: 'background', background: { kind: 'gradient', speed: 30 } })

    const theme = listPluginThemes().find((t) => t.pluginId === 'com.test.worker')
    expect(theme?.name).toBe('Nord')
    // The sandbox can describe a theme; it cannot smuggle a remote request in one.
    expect(theme?.tokens['--accent']).toBeUndefined()
    expect(getPluginBackground()).toMatchObject({ kind: 'gradient', speed: 30 })

    pluginRegistry.unregister('com.test.worker')
    expect(listPluginThemes().some((t) => t.pluginId === 'com.test.worker')).toBe(false)
    expect(getPluginBackground()).toBeNull()
  })

  it('rate-limits a worker that spams registrations, not just its rpcs', async () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(), w)

    // A worker redeclaring a panel in a loop makes no rpc at all, and answers
    // every heartbeat — `guard` and the watchdog both see a model citizen. The
    // cost is real though: each one re-sanitizes and notifies every subscriber.
    for (let i = 0; i < 400; i++) {
      w.say({ k: 'panel', id: 'spam.panel', title: `n${i}`, blocks: [{ type: 'text', text: 'x' }] })
    }

    // Refusals are silent to the worker by design (there is nobody to throw to),
    // so the evidence is that it stopped being applied and the plugin was cut off.
    await vi.waitFor(() => {
      expect(pluginRegistry.isRegistered('com.test.worker')).toBe(false)
    })
    expect(listBlockPanels().find((p) => p.id === 'spam.panel')).toBeUndefined()

    setPluginEnabledState('com.test.worker', true)
  })

  it('unregisters on a fatal load error, tearing its contributions down', () => {
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(), w)
    w.say({ k: 'command', id: 'doomed.cmd', label: 'Doomed' })

    w.say({ k: 'fatal', message: 'boom' })

    expect(pluginRegistry.isRegistered('com.test.worker')).toBe(false)
    expect(listCommands().find((c) => c.id === 'doomed.cmd')).toBeUndefined()
    expect(getSettingsDefinition('com.test.worker')).toBeUndefined()
  })

  it('terminates a worker that stops answering the heartbeat', () => {
    vi.useFakeTimers()
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(), w)

    // A worker spinning in a loop makes no calls, so the rate limiter sees nothing
    // wrong — silence is the only symptom there is.
    vi.advanceTimersByTime(HEARTBEAT_MS * (HEARTBEAT_MISSES + 1))

    expect(w.sent.some((m) => m.k === 'ping')).toBe(true)
    expect(pluginRegistry.isRegistered('com.test.worker')).toBe(false)
    expect(isPluginEnabled('com.test.worker')).toBe(false)

    setPluginEnabledState('com.test.worker', true)
    vi.useRealTimers()
  })

  it('leaves a worker alone while it keeps answering', () => {
    vi.useFakeTimers()
    const w = new FakeWorker()
    pluginRegistry.registerWorker(meta(), w)

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(HEARTBEAT_MS)
      const ping = [...w.sent].reverse().find((m) => m.k === 'ping')
      if (ping && ping.k === 'ping') w.say({ k: 'pong', n: ping.n })
    }

    expect(pluginRegistry.isRegistered('com.test.worker')).toBe(true)
    pluginRegistry.unregister('com.test.worker')
    vi.useRealTimers()
  })

  it('asks for destroy before terminating, and stops forwarding after', () => {
    const w = new FakeWorker()
    const dispose = vi.fn()
    pluginRegistry.registerWorker(meta(), w, dispose)
    w.say({ k: 'subscribe', event: 'workspace:changed' })

    pluginRegistry.unregister('com.test.worker')
    expect(w.sent).toContainEqual({ k: 'destroy' })
    expect(w.terminated).toBe(false)

    w.say({ k: 'bye' })
    expect(w.terminated).toBe(true)
    expect(dispose).toHaveBeenCalled()

    const before = w.sent.length
    eventBus.emit('workspace:changed', { id: 'w2' })
    expect(w.sent).toHaveLength(before)
  })
})
