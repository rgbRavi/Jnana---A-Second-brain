// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

/// <reference path="../../types/jnana-plugin.d.ts" />

// Sample Worker — the reference *sandboxed* Jnana plugin.
//
// Its manifest says `"runtime": "worker"`, so it runs in a Web Worker: no DOM, no
// IPC, no direct anything. Every capability below is answered by the host, which
// refuses whatever this plugin wasn't granted — so the `notes` permission is a
// real boundary here, not a label.
//
// No build step on purpose: plain ESM, `main` points straight at this file. A
// worker plugin can't render, so there's no JSX and no react — which is why it
// needs no bundler at all.

/** @type {Jnana.Plugin} */
const plugin = {
  id: 'com.jnana.sample-worker',
  name: 'Sample Worker',
  version: '1.0.0',

  /** @param {Jnana.PluginContext} ctx */
  init(ctx) {
    // A worker has no UI, so its settings are declared as data and rendered by
    // Jnana in Settings -> Plugins with the app's own controls. Values are stored
    // in this plugin's storage under `__settings`, so they survive restarts and can
    // be read back like any other key.
    let settings = { label: 'notes', loud: true }
    void ctx.storage.get('__settings').then((stored) => {
      if (stored) settings = { ...settings, ...stored }
    })

    ctx.ui.registerSettings({
      fields: [
        { key: 'label', label: 'Word for notes', type: 'text', default: 'notes', hint: 'Used in the message' },
        { key: 'loud', label: 'Show a toast', type: 'toggle', default: true },
      ],
      onChange: (values) => {
        settings = { ...settings, ...values }
      },
    })

    // A panel in the right rail, described as data. A worker can't render, so it
    // sends blocks and Jnana draws them with its own controls — the sandbox is not
    // shut out of the best surface in the app, it just doesn't touch the DOM.
    const showPanel = (counted) => {
      ctx.ui.registerBlockPanel({
        id: 'sample-worker.panel',
        title: 'Sample Worker',
        blocks: [
          { type: 'heading', text: 'Notes in this vault' },
          counted === null
            ? { type: 'text', text: 'Press Count to check.' }
            : { type: 'table', headers: ['What', 'Value'], rows: [[settings.label, String(counted)]] },
          { type: 'button', label: 'Count', actionId: 'count' },
        ],
        // Re-registering the same id is how the panel updates itself.
        onAction: (actionId) => {
          if (actionId === 'count') void count()
        },
      })
    }

    // A fenced code language this plugin renders: ```notecount in a note becomes a
    // small table instead of a code block. Same block format as the panel, and the
    // same reason it is data — a plugin never reaches the document.
    ctx.ui.registerFence({
      lang: 'notecount',
      render: async (source) => {
        const notes = (await ctx.notes?.getAll()) ?? []
        const needle = source.trim().toLowerCase()
        const matching = needle
          ? notes.filter((n) => (n.title ?? '').toLowerCase().includes(needle))
          : notes
        return [
          { type: 'heading', text: needle ? `Notes matching “${needle}”` : 'All notes' },
          { type: 'table', headers: ['Title'], rows: matching.slice(0, 10).map((n) => [n.title ?? n.id]) },
          { type: 'text', text: `${matching.length} of ${notes.length}` },
        ]
      },
    })

    const count = async () => {
      const notes = (await ctx.notes?.getAll()) ?? []
      const runs = ((await ctx.storage.get('runs')) ?? 0) + 1
      await ctx.storage.set('runs', runs)
      await ctx.storage.set('lastCount', notes.length)
      showPanel(notes.length)
      if (settings.loud) {
        ctx.bus.emit('toast:info', `${notes.length} ${settings.label} (counted ${runs}x)`)
      }
    }

    showPanel(null)

    ctx.ui.registerCommand({
      id: 'sample-worker.count',
      label: 'Sample Worker: count my notes',
      icon: '🧮',
      hint: 'Runs in the plugin sandbox',
      // A suggestion only: the user can rebind or clear it in Settings → Plugins,
      // and Jnana's own bindings always win.
      hotkey: 'mod+alt+c',
      // Granted `notes`, so the host answers this. Without the permission the same
      // call comes back as a rejected promise, not silently empty — and workers
      // have no UI, so the result is spoken through the event bus and the panel.
      run: count,
    })

    // Anything the app broadcasts can be listened to, without being able to forge it.
    ctx.bus.on('workspace:changed', () => {
      void ctx.storage.set('lastWorkspaceChange', Date.now())
    })
  },

  destroy() {
    // Runs before the worker is terminated — the host waits briefly for it.
  },
}

export default plugin
