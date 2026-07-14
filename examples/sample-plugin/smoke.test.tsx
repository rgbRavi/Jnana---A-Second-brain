// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// End-to-end smoke test for the plugin loader runtime. It imports the *built*
// artifact (dist/main.js — the same ESM bundle the loader reads from disk),
// registers its note type, and renders the View/Editor with the host React. This
// exercises everything the loader depends on except the literal Blob-URL import in
// the live webview: esbuild bundling with `react` external, a default Plugin
// export, note-type registration, and hooks/JSX running against a single React.
//
// The bundle is committed; rebuild with `npm run build` in this folder after
// editing src/index.tsx.

import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import builtPlugin from './dist/main.js'
import { rewritePluginImports } from '../../src/core/plugins/hostBridge'

/* eslint-disable @typescript-eslint/no-explicit-any */
const plugin = builtPlugin as any

function loadNoteType(): any {
  let def: any
  plugin.init({
    pluginId: plugin.id,
    registerNoteType: (d: any) => {
      def = d
    },
  })
  return def
}

describe('sample-plugin: loader runtime smoke test', () => {
  it('the built bundle exports a well-formed Plugin', () => {
    expect(plugin.id).toBe('com.jnana.sample-checklist')
    expect(plugin.version).toBe('1.0.0')
    expect(typeof plugin.init).toBe('function')
  })

  it('registers its note type', () => {
    const def = loadNoteType()
    expect(def.id).toBe('sample-checklist')
    expect(def.label).toBe('Checklist')
    expect(def.newContent()).toBe('{"items":[]}')
  })

  it('View renders against the host React (hooks + JSX in a loaded bundle)', () => {
    const def = loadNoteType()
    const note = {
      id: 'n',
      content: JSON.stringify({
        items: [
          { id: 'a', text: 'Buy milk', done: true },
          { id: 'b', text: 'Walk dog', done: false },
        ],
      }),
    }
    const { getByTestId, getByText } = render(<def.View note={note} />)
    expect(getByTestId('progress').textContent).toBe('1/2 done')
    expect(getByText(/Buy milk/)).toBeTruthy()
    expect(getByText(/Walk dog/)).toBeTruthy()
  })

  it('Editor uses useState and drives onChange (proves a single shared React)', () => {
    const def = loadNoteType()
    const changes: string[] = []
    const { getByLabelText, getByText } = render(
      <def.Editor note={{}} value={'{"items":[]}'} onChange={(s: string) => changes.push(s)} />,
    )
    fireEvent.change(getByLabelText('new-item'), { target: { value: 'Task 1' } })
    fireEvent.click(getByText('Add'))
    expect(changes.length).toBeGreaterThan(0)
    const last = JSON.parse(changes[changes.length - 1])
    expect(last.items[0].text).toBe('Task 1')
    expect(last.items[0].done).toBe(false)
  })

  it('toSearchText / toExportMarkdown project real text (search + export integration)', () => {
    const def = loadNoteType()
    const note = { content: JSON.stringify({ items: [{ id: '1', text: 'hello', done: true }] }) }
    expect(def.toSearchText(note)).toBe('hello')
    expect(def.toExportMarkdown(note)).toBe('- [x] hello')
  })

  it('the built bundle externalizes react, so the loader rewrite rewires it', () => {
    // Mock createObjectURL (jsdom lacks it) so the host-bridge shims get URLs.
    let n = 0
    ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => `blob:mock-${++n}`

    // Tests run from the repo root; read the committed artifact directly.
    const raw = readFileSync('examples/sample-plugin/dist/main.js', 'utf8')
    // The artifact imports bare react (external) — the precondition for loading.
    expect(raw).toMatch(/from ["']react["']/)
    expect(raw).toMatch(/from ["']react\/jsx-runtime["']/)

    const rewritten = rewritePluginImports(raw)
    // After rewrite the bare specifiers are gone, replaced by the host shim blobs.
    expect(rewritten).not.toMatch(/from ["']react["']/)
    expect(rewritten).not.toMatch(/from ["']react\/jsx-runtime["']/)
    expect(rewritten).toContain('blob:mock-')
  })
})
