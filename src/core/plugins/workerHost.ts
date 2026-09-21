// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Spawning side of the worker runtime. A plugin whose manifest says
// `"runtime": "worker"` is loaded into a Web Worker instead of the main thread:
// its bundle becomes one Blob module, a small bootstrap (below) becomes another,
// and the worker imports the first from the second.
//
// The bootstrap is the worker-side half of the plugin API: it builds the same
// `ctx` shape a main-thread plugin gets, but every capability is a postMessage
// away, so the host decides what to answer. `registerNoteType` / `registerWidget`
// throw here with a message pointing at the manifest — a worker has no DOM, so a
// plugin that renders belongs on the main thread. React imports are *not*
// rewritten for this runtime (there is no host React to share); a bundle that
// imports react fails to load, which is the honest outcome.

import type { WorkerLike } from '../../lib/pluginWorkerProtocol'

/** Source of the worker bootstrap. `__PLUGIN_URL__` is substituted at spawn. */
const BOOTSTRAP = `
const PLUGIN_URL = __PLUGIN_URL__;
const subs = new Map();
const commands = new Map();
const panels = new Map();
const fences = new Map();
const pending = new Map();
let seq = 0;
let plugin = null;
let settingsChanged = null;

const say = (m) => self.postMessage(m);
const message = (e) => (e && e.message) || String(e);
const report = (e) => say({ k: 'log', level: 'error', message: message(e) });

function rpc(ns, fn, args) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    say({ k: 'rpc', id, ns, fn, args });
  });
}

const renderErr = (what) =>
  new Error(what + ' needs the main-thread runtime — remove "runtime": "worker" from your manifest.');

function buildContext(pluginId, granted) {
  const ctx = {
    pluginId,
    bus: {
      on(event, handler) {
        const list = subs.get(event);
        if (list) list.push(handler);
        else {
          subs.set(event, [handler]);
          say({ k: 'subscribe', event });
        }
      },
      emit(event, payload) {
        say({ k: 'emit', event, payload });
      },
    },
    storage: {
      get: (key) => rpc('storage', 'get', [key]),
      set: (key, value) => rpc('storage', 'set', [key, value]),
      delete: (key) => rpc('storage', 'delete', [key]),
      list: () => rpc('storage', 'list', []),
    },
    registerNoteType() {
      throw renderErr('registerNoteType');
    },
    ui: {
      registerWidget() {
        throw renderErr('registerWidget');
      },
      registerCommand(command) {
        commands.set(command.id, command.run);
        say({
          k: 'command',
          id: command.id,
          label: command.label,
          icon: command.icon,
          hint: command.hint,
          hotkey: command.hotkey,
        });
      },
      registerRailPanel() {
        throw renderErr('registerRailPanel');
      },
      registerBlockPanel(panel) {
        // A panel described as data is the sandbox's way onto the best surface in
        // the app. Registering the same id again replaces it — that is an update.
        panels.set(panel.id, panel.onAction || null);
        say({ k: 'panel', id: panel.id, title: panel.title, blocks: panel.blocks || [] });
      },
      registerFence(fence) {
        fences.set(fence.lang, fence.render);
        say({ k: 'fence', lang: fence.lang });
      },
      registerTheme(theme) {
        // Tokens are validated host-side; a worker can describe a theme but not
        // write CSS, same as everything else here.
        say({ k: 'theme', theme: theme });
      },
      setBackground(background) {
        say({ k: 'background', background: background ?? null });
      },
      registerSettings(definition) {
        // The pane is data; the host renders it with the app's own controls and
        // sends the values back. That is how a worker plugin gets configured at all.
        settingsChanged = definition.onChange || null;
        say({ k: 'settings', fields: definition.fields || [] });
      },
    },
  };
  if (granted.indexOf('notes') !== -1) {
    ctx.notes = {
      getAll: () => rpc('notes', 'getAll', []),
      getById: (id) => rpc('notes', 'getById', [id]),
      search: (query) => rpc('notes', 'search', [query]),
      create: (title, content) => rpc('notes', 'create', [title, content]),
      saveContent: (id, content) => rpc('notes', 'saveContent', [id, content]),
    };
  }
  if (granted.indexOf('media') !== -1) {
    ctx.media = {
      list: (noteId) => rpc('media', 'list', [noteId]),
      read: (filename) => rpc('media', 'read', [filename]),
      write: (bytes, extension) => rpc('media', 'write', [bytes, extension]),
    };
  }
  if (granted.indexOf('network') !== -1) {
    ctx.net = { request: (url, init) => rpc('net', 'request', [url, init]) };
  }
  return ctx;
}

async function start(pluginId, granted) {
  try {
    const mod = await import(PLUGIN_URL);
    plugin = mod.default ?? mod.plugin;
    if (!plugin || typeof plugin !== 'object' || plugin.id !== pluginId) {
      throw new Error('did not export a default Plugin whose id matches its manifest');
    }
    await plugin.init?.(buildContext(pluginId, granted));
    say({ k: 'ready' });
  } catch (err) {
    say({ k: 'fatal', message: message(err) });
  }
}

self.onmessage = (e) => {
  const m = (e && e.data) || {};
  if (m.k === 'init') {
    start(m.pluginId, m.granted || []);
  } else if (m.k === 'event') {
    for (const handler of subs.get(m.event) || []) {
      try {
        handler(m.payload);
      } catch (err) {
        report(err);
      }
    }
  } else if (m.k === 'rpcResult') {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.value);
    else p.reject(new Error(m.error));
  } else if (m.k === 'run') {
    const run = commands.get(m.commandId);
    if (run) {
      try {
        run();
      } catch (err) {
        report(err);
      }
    }
  } else if (m.k === 'action') {
    const onAction = panels.get(m.panelId);
    if (onAction) {
      try {
        onAction(m.actionId);
      } catch (err) {
        report(err);
      }
    }
  } else if (m.k === 'render') {
    const render = fences.get(m.lang);
    Promise.resolve()
      .then(() => (render ? render(m.source) : []))
      .then((blocks) => say({ k: 'renderResult', id: m.id, ok: true, blocks: blocks || [] }))
      .catch((err) => say({ k: 'renderResult', id: m.id, ok: false, error: message(err) }));
  } else if (m.k === 'ping') {
    say({ k: 'pong', n: m.n });
  } else if (m.k === 'settingsChanged') {
    if (settingsChanged) {
      try {
        settingsChanged(m.values || {});
      } catch (err) {
        report(err);
      }
    }
  } else if (m.k === 'destroy') {
    try {
      plugin?.destroy?.();
    } catch (err) {
      report(err);
    }
    say({ k: 'bye' });
  }
};
`

/** A spawned worker plus the Blob URLs it lives on (revoked on teardown). */
export interface SpawnedWorker {
  worker: WorkerLike
  dispose: () => void
}

/**
 * Spawn a worker running `code` (a plugin's built ESM bundle). The caller sends
 * the `init` message — the registry does, once it has wired up the handlers, so
 * no message from the plugin can arrive unhandled.
 */
export function spawnPluginWorker(code: string): SpawnedWorker {
  const pluginUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  const bootstrap = BOOTSTRAP.replace('__PLUGIN_URL__', JSON.stringify(pluginUrl))
  const bootUrl = URL.createObjectURL(new Blob([bootstrap], { type: 'text/javascript' }))
  const worker = new Worker(bootUrl, { type: 'module' }) as unknown as WorkerLike
  return {
    worker,
    // Kept alive while the worker runs: it imports the plugin URL lazily, and
    // revoking either one early would break the import.
    dispose: () => {
      URL.revokeObjectURL(pluginUrl)
      URL.revokeObjectURL(bootUrl)
    },
  }
}
