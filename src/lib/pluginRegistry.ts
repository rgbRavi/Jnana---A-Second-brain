// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Plug } from 'lucide-react'
import type { Plugin } from '../types'
import type { PluginRegisterOptions } from './pluginApi'
import { eventBus, PluginBus } from './eventBus'
import { registerNoteType, unregisterNoteType } from './noteTypes'
import {
  registerWidget,
  unregisterWidget,
  registerCommand,
  unregisterCommand,
  registerSettings,
  unregisterSettings,
  registerBlockPanel,
  unregisterBlockPanel,
  registerFence,
  unregisterFence,
} from './pluginContributions'
import { registerRailPanel, unregisterRailPanel } from './rightRailPanels'
import {
  clearPluginAppearance,
  getPluginBackground,
  registerPluginTheme,
  setPluginBackground,
  setPluginBackgroundSrc,
} from './pluginThemes'
import { readPluginFile } from '../core/plugins/loader'
import { sanitizeBlocks } from './pluginBlocks'
import { setPluginEnabledState } from './pluginEnabled'
import { clearPluginActivity } from './pluginActivity'
import { chargePluginCall, resetPluginBudget } from '../core/plugins/guard'
import { toast } from './toast'
import { pluginLog } from './pluginLog'
import { makePluginStorage } from '../core/plugins/storage'
import { makePluginNotesApi } from '../core/plugins/notesApi'
import { makePluginNet } from '../core/plugins/net'
import { makePluginMediaApi } from '../core/plugins/mediaApi'
import {
  DESTROY_GRACE_MS,
  HEARTBEAT_MS,
  HEARTBEAT_MISSES,
  RENDER_TIMEOUT_MS,
  type WorkerLike,
  type WorkerToHost,
} from './pluginWorkerProtocol'

/** What the host needs to know about a worker plugin it is adopting. */
export interface WorkerPluginMeta {
  id: string
  name: string
  version: string
  /** Permissions granted at install; gates which RPC namespaces are answered. */
  granted: string[]
}

/**
 * Apply a plugin's backdrop, reading the image out of its own folder when it
 * shipped one. The read is async and the answer may arrive late, so
 * `setPluginBackgroundSrc` re-checks that this is still the background in force.
 */
function applyPluginBackground(pluginId: string, input: unknown): void {
  if (!setPluginBackground(pluginId, input ?? null)) {
    pluginLog('warn', 'Background refused — unknown kind, bad colours or an unusable image path', pluginId)
    return
  }
  const bg = getPluginBackground()
  if (bg?.pluginId !== pluginId || bg.kind !== 'image' || !bg.file) return
  const file = bg.file
  void readPluginFile(pluginId, file)
    .then((src) => setPluginBackgroundSrc(pluginId, file, src))
    .catch((err: unknown) => {
      pluginLog('warn', `Backdrop image "${file}" could not be read: ${err instanceof Error ? err.message : String(err)}`, pluginId)
      // Left with no `src`, so the layer renders nothing rather than a broken
      // image — the rest of the plugin is unaffected.
    })
}

// Core app events that worker plugins are not allowed to emit
const WORKER_BLOCKED_EVENTS = new Set([
  'note:saved', 'note:opened', 'note:deleted',
  'link:created', 'link:removed',
  'annotation:created', 'annotation:updated', 'annotation:deleted',
])

class PluginRegistry {
  private plugins = new Map<string, Plugin>()
  private buses = new Map<string, PluginBus>()
  private workers = new Map<string, WorkerLike>()
  // Per-worker shutdown (destroy handshake → terminate → release Blob URLs).
  private workerStops = new Map<string, () => void>()
  // Heartbeat timers, so a wedged worker can be noticed and stopped.
  private workerBeats = new Map<string, ReturnType<typeof setInterval>>()
  // tracks per-worker which events have been forwarded so we can clean up
  private workerForwardCleanups = new Map<string, Array<() => void>>()
  // note types each inline plugin registered, so unregister can tear them down
  private pluginNoteTypes = new Map<string, string[]>()
  // widget / command / panel / fence ids each plugin contributed, for teardown
  private pluginContribs = new Map<
    string,
    { widgets: string[]; commands: string[]; railPanels: string[]; blockPanels: string[]; fences: string[] }
  >()

  /** Register a plugin. Omit `opts` for trusted first-party plugins (full context);
   *  loaded third-party plugins pass `opts.grantedPermissions` so their context is
   *  capability-gated. */
  register(plugin: Plugin, opts?: PluginRegisterOptions): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin "${plugin.id}" is already registered`)
      return
    }

    this._registerInlinePlugin(plugin, opts)

    this.plugins.set(plugin.id, plugin)
    eventBus.emit('plugin:registered', { id: plugin.id })
    console.log(`Plugin "${plugin.name}" v${plugin.version} loaded`)
    pluginLog('info', `Loaded v${plugin.version}`, plugin.id)
  }

  /** Which plugin contributed a note type — so a crashed note-type view can offer
   *  to disable the plugin responsible, rather than just naming the type. */
  pluginIdForNoteType(kind: string): string | undefined {
    for (const [id, kinds] of this.pluginNoteTypes) {
      if (kinds.includes(kind)) return id
    }
    return undefined
  }

  /** Which plugin contributed a widget. */
  pluginIdForWidget(widgetId: string): string | undefined {
    for (const [id, contribs] of this.pluginContribs) {
      if (contribs.widgets.includes(widgetId)) return id
    }
    return undefined
  }

  /** Ids of the command-palette entries a plugin contributed — the Shortcuts list
   *  in Settings → Plugins binds keys to these. */
  commandIdsOf(id: string): string[] {
    return this.pluginContribs.get(id)?.commands ?? []
  }

  /** Ids of the note types a (registered) plugin contributed — drives the manager's
   *  "Provides" line. Empty for a plugin that's unregistered or contributes none. */
  noteTypeIdsOf(id: string): string[] {
    return this.pluginNoteTypes.get(id) ?? []
  }

  isRegistered(id: string): boolean {
    return this.plugins.has(id)
  }

  unregister(id: string): void {
    const plugin = this.plugins.get(id)
    if (!plugin) return

    // Clean up inline plugin
    const bus = this.buses.get(id)
    if (bus) {
      plugin.destroy?.()
      bus.dispose()
      this.buses.delete(id)
    }
    // Remove any note types this plugin registered.
    const kinds = this.pluginNoteTypes.get(id)
    if (kinds) {
      kinds.forEach(unregisterNoteType)
      this.pluginNoteTypes.delete(id)
    }
    // Remove any widgets / commands / settings it contributed.
    const contribs = this.pluginContribs.get(id)
    if (contribs) {
      contribs.widgets.forEach(unregisterWidget)
      contribs.commands.forEach(unregisterCommand)
      contribs.railPanels.forEach(unregisterRailPanel)
      contribs.blockPanels.forEach(unregisterBlockPanel)
      contribs.fences.forEach(unregisterFence)
      this.pluginContribs.delete(id)
    }
    unregisterSettings(id)
    clearPluginAppearance(id)
    resetPluginBudget(id)
    clearPluginActivity(id)
    pluginLog('info', 'Unloaded', id)

    // Clean up worker plugin — give it a moment to run destroy() (its state lives
    // in the worker, so terminating first would drop any final save), then kill it
    // whether or not it answered.
    const worker = this.workers.get(id)
    if (worker) {
      const cleanups = this.workerForwardCleanups.get(id) ?? []
      cleanups.forEach((fn) => fn())
      this.workerForwardCleanups.delete(id)
      this.workers.delete(id)
      const beat = this.workerBeats.get(id)
      if (beat) {
        clearInterval(beat)
        this.workerBeats.delete(id)
      }
      const stop = this.workerStops.get(id)
      this.workerStops.delete(id)
      stop?.()
    }

    this.plugins.delete(id)
  }

  /**
   * Adopt a plugin running in a Web Worker. Unlike the inline path this *is* a
   * boundary: the worker has no DOM and no IPC, so every capability it gets is
   * one the host answers here — and an RPC for a namespace it wasn't granted is
   * refused rather than merely undefined on its context object.
   *
   * `onDispose` releases whatever the spawner holds (Blob URLs), and is run after
   * the worker is gone.
   */
  registerWorker(meta: WorkerPluginMeta, worker: WorkerLike, onDispose?: () => void): void {
    if (this.plugins.has(meta.id)) {
      console.warn(`Plugin "${meta.id}" is already registered`)
      return
    }
    const granted = new Set(meta.granted)
    const storage = makePluginStorage(meta.id)
    const notes = granted.has('notes') ? makePluginNotesApi(meta.id) : null
    const net = granted.has('network') ? makePluginNet(meta.id) : null
    const media = granted.has('media') ? makePluginMediaApi(meta.id) : null
    const cleanups: Array<() => void> = []
    const commandIds: string[] = []
    const panelIds: string[] = []
    const fenceLangs: string[] = []
    // Fence renders the host is waiting on, by request id.
    const renders = new Map<number, (blocks: unknown) => void>()
    let renderSeq = 0
    const subscribed = new Set<string>()
    let unanswered = 0
    let beats = 0

    const answer = async (id: number, run: () => Promise<unknown>) => {
      try {
        worker.postMessage({ k: 'rpcResult', id, ok: true, value: (await run()) ?? null })
      } catch (err) {
        worker.postMessage({
          k: 'rpcResult',
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const call = (ns: string, fn: string, args: unknown[]): Promise<unknown> => {
      if (ns === 'storage') {
        if (fn === 'get') return storage.get(args[0] as string)
        if (fn === 'set') return storage.set(args[0] as string, args[1])
        if (fn === 'delete') return storage.delete(args[0] as string)
        if (fn === 'list') return storage.list()
      }
      if (ns === 'notes') {
        if (!notes) {
          return Promise.reject(
            new Error(`"${meta.name}" was not granted the notes permission.`),
          )
        }
        if (fn === 'getAll') return notes.getAll()
        if (fn === 'getById') return notes.getById(args[0] as string)
        if (fn === 'search') return notes.search(args[0] as string)
        if (fn === 'create') return notes.create(args[0] as string, args[1] as string | undefined)
        if (fn === 'saveContent') return notes.saveContent(args[0] as string, args[1] as string)
      }
      if (ns === 'media') {
        if (!media) {
          return Promise.reject(
            new Error(`"${meta.name}" was not granted access to attachments.`),
          )
        }
        if (fn === 'list') return media.list(args[0] as string)
        if (fn === 'read') return media.read(args[0] as string)
        if (fn === 'write') return media.write(args[0] as Uint8Array, args[1] as string)
      }
      if (ns === 'net') {
        if (!net) {
          return Promise.reject(
            new Error(`"${meta.name}" was not granted the network permission.`),
          )
        }
        if (fn === 'request') {
          return net.request(args[0] as string, args[1] as Parameters<typeof net.request>[1])
        }
      }
      return Promise.reject(new Error(`Unknown plugin API "${ns}.${fn}".`))
    }

    worker.onmessage = (event: { data: WorkerToHost }) => {
      const m = event.data
      // Everything a worker can say that costs the host something is charged to
      // its budget. `rpc` is excluded because `guard` charges it on the way
      // through, and the bookkeeping answers (`pong`, `bye`, `renderResult`) are
      // replies to messages the host itself sent — rate-limiting those would
      // punish a plugin for answering.
      const FREE: WorkerToHost['k'][] = ['rpc', 'pong', 'bye', 'renderResult', 'ready', 'fatal']
      if (!FREE.includes(m.k) && !chargePluginCall(meta.id)) return
      switch (m.k) {
        case 'subscribe': {
          // One forward per event, however often the plugin subscribes — its own
          // handler list lives worker-side.
          if (subscribed.has(m.event)) return
          subscribed.add(m.event)
          const forward = (payload: unknown) => worker.postMessage({ k: 'event', event: m.event, payload })
          eventBus.on(m.event, forward)
          cleanups.push(() => eventBus.off(m.event, forward))
          return
        }
        case 'emit':
          if (WORKER_BLOCKED_EVENTS.has(m.event)) {
            console.warn(`[PluginRegistry] Worker plugin "${meta.id}" blocked from emitting "${m.event}"`)
            pluginLog('warn', `Blocked from emitting core event "${m.event}"`, meta.id)
            return
          }
          eventBus.emit(m.event, m.payload)
          return
        case 'rpc':
          void answer(m.id, () => call(m.ns, m.fn, m.args))
          return
        case 'settings': {
          // A worker has no UI, so its pane is declared as data and rendered by the
          // host; changes travel back over the same channel.
          registerSettings(meta.id, {
            fields: m.fields,
            onChange: (values) => worker.postMessage({ k: 'settingsChanged', values }),
          })
          return
        }
        case 'command': {
          registerCommand({
            id: m.id,
            label: m.label,
            icon: m.icon,
            hint: m.hint,
            hotkey: m.hotkey,
            run: () => worker.postMessage({ k: 'run', commandId: m.id }),
          })
          commandIds.push(m.id)
          return
        }
        case 'panel': {
          // A worker can't render, so its panel is blocks; pressing a button in it
          // comes back here and goes out as an `action`.
          registerBlockPanel(meta.id, {
            id: m.id,
            title: m.title,
            blocks: sanitizeBlocks(m.blocks),
            onAction: (actionId) => worker.postMessage({ k: 'action', panelId: m.id, actionId }),
          })
          if (!panelIds.includes(m.id)) panelIds.push(m.id)
          return
        }
        case 'fence': {
          // Each fence the user is looking at becomes one `render` round-trip. It
          // is time-boxed: a worker that never answers leaves the plain code block
          // on screen rather than an empty space that never fills.
          const claimed = registerFence(meta.id, {
            lang: m.lang,
            render: (source) =>
              new Promise((resolve, reject) => {
                const id = ++renderSeq
                const timer = setTimeout(() => {
                  renders.delete(id)
                  reject(new Error(`"${meta.name}" took too long to render this block.`))
                }, RENDER_TIMEOUT_MS)
                renders.set(id, (blocks) => {
                  clearTimeout(timer)
                  resolve(sanitizeBlocks(blocks))
                })
                worker.postMessage({ k: 'render', id, lang: m.lang, source })
              }),
          })
          if (!claimed) {
            pluginLog('warn', `Another plugin already renders \`\`\`${m.lang}`, meta.id)
            return
          }
          if (!fenceLangs.includes(m.lang)) fenceLangs.push(m.lang)
          return
        }
        case 'theme': {
          if (!registerPluginTheme(meta.id, m.theme)) {
            pluginLog('warn', 'Theme refused — every token was missing or unparseable', meta.id)
          }
          return
        }
        case 'background': {
          applyPluginBackground(meta.id, m.background ?? null)
          return
        }
        case 'renderResult': {
          const resolve = renders.get(m.id)
          if (!resolve) return
          renders.delete(m.id)
          // A failed render resolves to nothing, which the fence host reads as
          // "fall back to the code block" — same outcome as a timeout.
          resolve(m.ok ? m.blocks : [])
          return
        }
        case 'log':
          pluginLog(m.level, m.message, meta.id)
          return
        case 'ready':
          pluginLog('info', `Loaded v${meta.version} (worker)`, meta.id)
          return
        case 'fatal':
          pluginLog('error', `Failed to load: ${m.message}`, meta.id)
          this.unregister(meta.id)
          return
        case 'pong':
          unanswered = 0
          return
        case 'bye':
          return
      }
    }

    worker.onerror = (err: { message?: string }) => {
      console.error(`[PluginRegistry] Worker plugin "${meta.id}" threw an error:`, err)
      pluginLog('error', `Worker error: ${err.message ?? 'unknown'}`, meta.id)
    }

    this.plugins.set(meta.id, { id: meta.id, name: meta.name, version: meta.version })
    this.workers.set(meta.id, worker)
    this.workerForwardCleanups.set(meta.id, cleanups)
    this.pluginContribs.set(meta.id, {
      widgets: [],
      commands: commandIds,
      railPanels: [],
      blockPanels: panelIds,
      fences: fenceLangs,
    })
    this.workerStops.set(meta.id, () => {
      let stopped = false
      const kill = () => {
        if (stopped) return
        stopped = true
        worker.onmessage = null
        worker.onerror = null
        worker.terminate()
        onDispose?.()
      }
      // From here the plugin is unregistered: anything it still says is ignored, or
      // a dying worker could register contributions nothing would tear down again.
      worker.onmessage = (event: { data: WorkerToHost }) => {
        if (event.data?.k === 'bye') kill()
      }
      worker.postMessage({ k: 'destroy' })
      setTimeout(kill, DESTROY_GRACE_MS)
    })

    worker.postMessage({ k: 'init', pluginId: meta.id, granted: [...granted] })

    // A worker that stops answering is burning a core with nothing to show for it,
    // and nothing else would ever notice: it makes no calls, so `guard` sees a
    // model citizen. Silence is the only symptom, so that is what we watch.
    const beat = setInterval(() => {
      if (unanswered >= HEARTBEAT_MISSES) {
        clearInterval(beat)
        this.workerBeats.delete(meta.id)
        pluginLog('error', 'Stopped responding — terminated', meta.id)
        this.unregister(meta.id)
        setPluginEnabledState(meta.id, false)
        toast(`Stopped "${meta.name}" — it stopped responding. Re-enable it in Settings → Plugins.`, {
          variant: 'error',
        })
        return
      }
      unanswered += 1
      beats += 1
      worker.postMessage({ k: 'ping', n: beats })
    }, HEARTBEAT_MS)
    this.workerBeats.set(meta.id, beat)

    eventBus.emit('plugin:registered', { id: meta.id })
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id)
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values())
  }

  /** A plugin that keeps hammering the host past its rate limit is not working —
   *  it is spinning, and while it spins the app stutters. Switch it off (persisted,
   *  so a restart doesn't bring the loop straight back) and say which one it was. */
  handleRunaway(pluginId: string, reason: string): void {
    if (!this.plugins.has(pluginId)) return
    const name = this.plugins.get(pluginId)?.name ?? pluginId
    pluginLog('error', `Disabled: kept exceeding its rate limit (${reason})`, pluginId)
    this.unregister(pluginId)
    setPluginEnabledState(pluginId, false)
    toast.error(`Disabled "${name}" — it was calling Jnana far too fast. Re-enable it in Settings → Plugins.`)
  }

  private _registerInlinePlugin(plugin: Plugin, opts?: PluginRegisterOptions): void {
    const bus = new PluginBus(eventBus)
    const registeredKinds: string[] = []
    // No opts = trusted first-party plugin (full context). A loaded plugin passes
    // opts (even if empty), so its access is gated by the granted permission set.
    const trusted = opts === undefined
    const granted = new Set(opts?.grantedPermissions ?? [])
    const canReadNotes = trusted || granted.has('notes')
    // Network is not part of the trusted grant: a built-in reaches the app's own
    // services directly, and `plugin_fetch` only knows about installed manifests.
    const canUseNetwork = granted.has('network')
    // Attachments are their own grant: a built-in reaching for media does so
    // through core/ directly, and a loaded plugin needs the user to have said yes
    // to `media` specifically — `notes` does not carry it.
    const canUseMedia = trusted || granted.has('media')
    const contribWidgets: string[] = []
    const contribCommands: string[] = []
    const contribRailPanels: string[] = []
    const contribBlockPanels: string[] = []
    const contribFences: string[] = []
    plugin.init?.({
      pluginId: plugin.id,
      bus,
      storage: makePluginStorage(plugin.id),
      notes: canReadNotes ? makePluginNotesApi(plugin.id) : undefined,
      net: canUseNetwork ? makePluginNet(plugin.id) : undefined,
      media: canUseMedia ? makePluginMediaApi(plugin.id) : undefined,
      registerNoteType: (def) => {
        if (!chargePluginCall(plugin.id)) return
        registerNoteType(def)
        registeredKinds.push(def.id)
      },
      ui: {
        registerWidget: (w) => {
          if (!chargePluginCall(plugin.id)) return
          registerWidget(w)
          contribWidgets.push(w.id)
        },
        registerCommand: (c) => {
          if (!chargePluginCall(plugin.id)) return
          registerCommand(c)
          contribCommands.push(c.id)
        },
        registerSettings: (definition) => {
          if (!chargePluginCall(plugin.id)) return
          registerSettings(plugin.id, definition)
        },
        registerRailPanel: (panel) => {
          if (!chargePluginCall(plugin.id)) return
          // The rail's icon strip is Lucide icons; a plugin bundle has no access
          // to them (only react is shimmed), so every plugin panel wears the plug.
          registerRailPanel({
            id: panel.id,
            title: panel.title,
            icon: Plug,
            order: 200,
            Component: panel.Component,
          })
          contribRailPanels.push(panel.id)
        },
        registerBlockPanel: (panel) => {
          if (!chargePluginCall(plugin.id)) return
          registerBlockPanel(plugin.id, panel)
          if (!contribBlockPanels.includes(panel.id)) contribBlockPanels.push(panel.id)
        },
        registerTheme: (theme) => {
          if (!chargePluginCall(plugin.id)) return
          if (!registerPluginTheme(plugin.id, theme)) {
            pluginLog('warn', 'Theme refused — every token was missing or unparseable', plugin.id)
          }
        },
        setBackground: (background) => {
          if (!chargePluginCall(plugin.id)) return
          applyPluginBackground(plugin.id, background)
        },
        registerFence: (fence) => {
          if (!chargePluginCall(plugin.id)) return
          if (!registerFence(plugin.id, fence)) {
            pluginLog('warn', `Another plugin already renders \`\`\`${fence.lang}`, plugin.id)
            return
          }
          if (!contribFences.includes(fence.lang)) contribFences.push(fence.lang)
        },
      },
    })
    this.buses.set(plugin.id, bus)
    this.pluginNoteTypes.set(plugin.id, registeredKinds)
    this.pluginContribs.set(plugin.id, {
      widgets: contribWidgets,
      commands: contribCommands,
      railPanels: contribRailPanels,
      blockPanels: contribBlockPanels,
      fences: contribFences,
    })
  }

}

export const pluginRegistry = new PluginRegistry()

// `guard` can't import the registry (it would close an import cycle), so a plugin
// that blows past its rate limit announces itself on the bus and is dealt with here.
eventBus.on('plugin:runaway', (payload: unknown) => {
  const { pluginId, reason } = (payload ?? {}) as { pluginId?: string; reason?: string }
  if (pluginId) pluginRegistry.handleRunaway(pluginId, reason ?? 'rate limit')
})
