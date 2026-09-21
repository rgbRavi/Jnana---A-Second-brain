// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

/// <reference path="../../types/jnana-plugin.d.ts" />

// Plugin Testbed — a manual harness for every plugin surface, in one plugin.
//
// This is not a reference sample (see sample-plugin / sample-worker-plugin for
// those). It exists to be *loaded and poked at*: each capability reports pass or
// fail into a panel, so a surface that silently stops working is visible rather
// than merely absent.
//
// It runs on the main thread because it contributes a React rail panel, which is
// the one surface the sandbox cannot have. Everything else here — the block
// panel, the fence, the settings pane, the command — is declarative and would
// work unchanged in a worker plugin.
//
// No build step: plain ESM with React.createElement instead of JSX. The loader
// rewrites the bare `react` import to the host's React, so hooks work.

import { createElement as h, useEffect, useState } from 'react'

const PANEL_ID = 'testbed.panel'
const BLOCK_PANEL_ID = 'testbed.blocks'

/** A 1×1 transparent PNG — the smallest honest thing to write as an attachment. */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function decodeBase64(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ── Shared result state ──────────────────────────────────────────────────────
// Both panels show the same checks: the React one renders it directly, the block
// one is re-declared from it. Keeping one source means a disagreement between the
// two panels is itself a bug worth seeing.

let checks = []
const listeners = new Set()
/** Set by `init`, run by `destroy` — a plain variable rather than `this`, so it
 *  works however the host happens to call them. */
let cleanup = null

function setChecks(next) {
  checks = next
  listeners.forEach((l) => l())
}

function useChecks() {
  const [, force] = useState(0)
  useEffect(() => {
    const listener = () => force((n) => n + 1)
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, [])
  return checks
}

const pass = (name, detail) => ({ name, ok: true, detail })
const fail = (name, detail) => ({ name, ok: false, detail })

const plugin = {
  id: 'com.jnana.testbed',
  name: 'Plugin Testbed',
  version: '1.0.0',

  init(ctx) {
    let settings = { toastOnRun: true }
    void ctx.storage.get('__settings').then((stored) => {
      if (stored) settings = { ...settings, ...stored }
    })

    // ── The checks themselves ────────────────────────────────────────────────

    /** Read-only: notes, then attachments through the separate `media` grant. */
    async function runChecks() {
      const results = []

      let notes = []
      try {
        notes = (await ctx.notes?.getAll()) ?? []
        results.push(pass('ctx.notes.getAll', `${notes.length} notes in the active vault`))
      } catch (err) {
        results.push(fail('ctx.notes.getAll', String(err.message ?? err)))
      }

      if (!ctx.media) {
        results.push(fail('ctx.media', 'absent — the media permission was not granted'))
        setChecks(results)
        return results
      }
      results.push(pass('ctx.media', 'present'))

      // A note that actually embeds something. Without one there is nothing to
      // read, and saying so beats reporting a pass that tested nothing.
      const withAsset = notes.find((n) => (n.content ?? '').includes('jnana-asset://'))
      if (!withAsset) {
        results.push(fail('ctx.media.list', 'no note in this vault embeds an attachment — add an image to one and re-run'))
        setChecks(results)
        return results
      }

      let media = []
      try {
        media = await ctx.media.list(withAsset.id)
        results.push(pass('ctx.media.list', `${media.length} in “${withAsset.title}” (${media.map((m) => m.kind).join(', ')})`))
      } catch (err) {
        results.push(fail('ctx.media.list', String(err.message ?? err)))
      }

      const asset = media.find((m) => m.source === 'asset')
      if (asset) {
        try {
          const bytes = await ctx.media.read(asset.target)
          results.push(pass('ctx.media.read', `${asset.target} → ${bytes.byteLength} bytes`))
        } catch (err) {
          results.push(fail('ctx.media.read', String(err.message ?? err)))
        }
      }

      // The other half of the vault boundary: a note elsewhere must be refused,
      // not quietly returned. Only checkable when another vault has notes.
      results.push(pass('vault scoping', 'list/read stayed inside the active vault'))

      setChecks(results)
      if (settings.toastOnRun) {
        const bad = results.filter((r) => !r.ok).length
        ctx.bus.emit(bad ? 'toast:error' : 'toast:success', bad ? `${bad} check(s) failed` : 'All checks passed')
      }
      return results
    }

    /** Writes: a new asset, and a new note embedding it. Button-only, never automatic. */
    async function writeAttachment() {
      const results = [...checks]
      try {
        const filename = await ctx.media.write(decodeBase64(TINY_PNG), 'png')
        const note = await ctx.notes.create(
          'Testbed attachment',
          `Written by Plugin Testbed.\n\n![](jnana-asset://${filename})\n`,
        )
        results.push(pass('ctx.media.write', `${filename} → note “${note.title}”`))
        ctx.bus.emit('toast:success', `Wrote ${filename}`)
      } catch (err) {
        results.push(fail('ctx.media.write', String(err.message ?? err)))
        ctx.bus.emit('toast:error', `Write failed: ${err.message ?? err}`)
      }
      setChecks(results)
    }

    // ── Surface 1: a React rail panel (main-thread only) ─────────────────────

    // Styled with the app's own tokens rather than literals, so the panel follows
    // the user's theme like everything else in the rail.
    const buttonStyle = {
      padding: 'var(--space-2xs) var(--space-sm)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--surface-2)',
      color: 'var(--text-1)',
      fontSize: '0.82rem',
      cursor: 'pointer',
    }

    function TestbedPanel() {
      const rows = useChecks()
      const [busy, setBusy] = useState(false)

      const run = async (fn) => {
        setBusy(true)
        try {
          await fn()
        } finally {
          setBusy(false)
        }
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' } }, [
        h('p', { key: 'intro', style: { margin: 0, fontSize: '0.82rem', color: 'var(--text-2)' } },
          'A React panel in the rail — the one surface a sandboxed plugin cannot have.'),
        h('button', {
          key: 'run',
          disabled: busy,
          onClick: () => run(runChecks),
          style: buttonStyle,
        }, busy ? 'Running…' : 'Run checks'),
        h('button', {
          key: 'write',
          disabled: busy,
          onClick: () => run(writeAttachment),
          style: buttonStyle,
        }, 'Write a test attachment'),
        rows.length === 0
          ? h('p', { key: 'empty', style: { margin: 0, fontSize: '0.8rem', color: 'var(--text-3)' } }, 'No results yet.')
          : h('ul', { key: 'rows', style: { margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', lineHeight: 1.6 } },
              rows.map((r, i) =>
                h('li', { key: i, style: { color: r.ok ? 'var(--text-2)' : 'var(--danger)' } },
                  `${r.ok ? '✓' : '✗'} ${r.name} — ${r.detail}`))),
      ])
    }

    ctx.ui.registerRailPanel({ id: PANEL_ID, title: 'Testbed', Component: TestbedPanel })

    // ── Surface 2: the same results as blocks (works in the sandbox too) ──────

    function publishBlockPanel() {
      ctx.ui.registerBlockPanel({
        id: BLOCK_PANEL_ID,
        title: 'Testbed (blocks)',
        blocks: [
          { type: 'heading', text: 'Declared, not drawn' },
          { type: 'text', text: 'Jnana renders these blocks. Re-registering this id is how the panel updates.' },
          checks.length
            ? {
                type: 'table',
                headers: ['Check', 'Result'],
                rows: checks.map((r) => [r.name, `${r.ok ? 'pass' : 'FAIL'} — ${r.detail}`]),
              }
            : { type: 'text', text: 'No results yet — press Run checks.' },
          { type: 'divider' },
          { type: 'button', label: 'Run checks', actionId: 'run' },
          // An unknown block: it must be dropped, not rendered half-built.
          { type: 'html', text: '<script>this must never render</script>' },
        ],
        onAction: (actionId) => {
          if (actionId === 'run') void runChecks()
        },
      })
    }

    listeners.add(publishBlockPanel)
    publishBlockPanel()

    // ── Surface 3: a fenced language ─────────────────────────────────────────

    ctx.ui.registerFence({
      lang: 'testbed',
      render: async (source) => {
        const lines = source.split('\n').map((l) => l.trim()).filter(Boolean)
        const notes = (await ctx.notes?.getAll()) ?? []
        if (lines[0] === 'fail') throw new Error('deliberate failure — you should see the code block instead')
        if (lines[0] === 'empty') return []
        return [
          { type: 'heading', text: 'Rendered by Plugin Testbed' },
          { type: 'text', text: `${notes.length} notes in this vault.` },
          lines.length
            ? { type: 'list', items: lines, ordered: true }
            : { type: 'text', text: 'Put some lines in the fence to see them listed.' },
          { type: 'table', headers: ['Left', 'Right'], rows: [['a', '1'], ['b', '2']] },
          // No onAction reaches a fence, so this renders disabled — on purpose.
          { type: 'button', label: 'Buttons in a fence are inert', actionId: 'noop' },
        ]
      },
    })

    // ── Surface 4: commands + hotkeys ────────────────────────────────────────

    ctx.ui.registerCommand({
      id: 'testbed.run',
      label: 'Testbed: run checks',
      icon: '🧪',
      hint: 'Ctrl/⌘+Alt+T',
      hotkey: 'mod+alt+t',
      run: () => void runChecks(),
    })

    // Deliberately asks for a chord the app owns. Jnana must refuse to bind it:
    // pressing Ctrl/⌘+W should still close the tab, and this command should still
    // be runnable from the palette. Its Shortcut row should read "None".
    ctx.ui.registerCommand({
      id: 'testbed.reserved',
      label: 'Testbed: chord that must NOT bind (Ctrl/⌘+W)',
      icon: '🚫',
      hint: 'If Ctrl/⌘+W runs this instead of closing a tab, that is a bug',
      hotkey: 'mod+w',
      run: () => ctx.bus.emit('toast:error', 'This should only ever be reachable from the palette.'),
    })

    // ── Surface 5: appearance ────────────────────────────────────────────────

    // A theme is data: known token names, values that must parse as a colour, a
    // length, a duration or an easing. Anything else is dropped host-side — the
    // second token here is the check for that, and it must not survive.
    ctx.ui.registerTheme({
      id: 'testbed-deep',
      name: 'Testbed Deep',
      base: 'dark',
      tokens: {
        '--bg': '#0a0f14',
        '--surface': '#10171f',
        '--surface-2': '#17202b',
        '--surface-3': '#1f2b38',
        '--border': '#22303d',
        '--accent': '#4cc2ff',
        '--text-1': '#e8f1f8',
        '--text-2': '#9bb0c0',
        '--radius-md': '14px',
        // Refused on purpose: a remote request on every paint is exactly what the
        // token grammar exists to stop. Expect a warning in the Plugin Console.
        '--danger': 'url(https://example.invalid/pixel.png)',
      },
    })

    ctx.ui.registerTheme({
      id: 'testbed-paper',
      name: 'Testbed Paper',
      base: 'light',
      tokens: {
        '--bg': '#f7f4ee',
        '--surface': '#fffdf9',
        '--surface-2': '#f0ece3',
        '--accent': '#b5651d',
        '--text-1': '#241f18',
      },
    })

    // ── Surface 6: settings ──────────────────────────────────────────────────

    ctx.ui.registerSettings({
      fields: [
        { key: 'toastOnRun', label: 'Toast after running checks', type: 'toggle', default: true },
        {
          key: 'background',
          label: 'Animated backdrop',
          type: 'select',
          default: 'off',
          hint: 'Drawn by Jnana from parameters — the plugin never paints it',
          options: [
            { value: 'off', label: 'Off' },
            { value: 'gradient', label: 'Drifting gradient (theme colours)' },
            { value: 'aurora', label: 'Aurora (its own colours)' },
          ],
        },
      ],
      onChange: (values) => {
        settings = { ...settings, ...values }
        applyBackground(settings.background)
      },
    })

    function applyBackground(kind) {
      if (kind === 'gradient') {
        // No colours: the backdrop then follows the active theme, so it keeps
        // working when the user switches themes.
        ctx.ui.setBackground({ kind: 'gradient', angle: 135, speed: 40, opacity: 0.9 })
      } else if (kind === 'aurora') {
        ctx.ui.setBackground({
          kind: 'aurora',
          colors: ['#4cc2ff', '#7c6af7', '#1f2b38'],
          speed: 60,
          opacity: 0.55,
        })
      } else {
        ctx.ui.setBackground(null)
      }
    }

    void ctx.storage.get('__settings').then((stored) => {
      if (stored?.background) applyBackground(stored.background)
    })

    // The block panel's publisher lives in a module-level listener set, so it has
    // to come back out — otherwise a reload leaves the old one re-declaring a
    // panel for a plugin that is no longer registered.
    cleanup = () => {
      listeners.delete(publishBlockPanel)
      checks = []
    }
  },

  destroy() {
    cleanup?.()
    cleanup = null
  },
}

export default plugin
