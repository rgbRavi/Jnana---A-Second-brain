// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The declarative UI a plugin can hand the host to render: a flat list of simple
// blocks. Two surfaces speak it — a worker plugin's rail panel, and a fenced-code
// renderer on either runtime — because both need a plugin to *describe* UI rather
// than draw it.
//
// Declarative on purpose. A worker has no DOM, so it could never render anyway;
// keeping fences declarative too means the same plugin works on both runtimes and
// no plugin code ever reaches the document. Everything here is text — there is no
// HTML block, and adding one would hand a plugin the DOM through the back door.
//
// Whatever arrives is untrusted: it crosses postMessage from a worker, or comes
// out of plugin code on the main thread. `sanitizeBlocks` is the boundary — it
// coerces, caps and drops, and never throws, so a malformed block list renders as
// less UI rather than as a crashed panel.

/** One renderable block. Text only — the host decides how each one looks. */
export type PluginBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'table'; headers?: string[]; rows: string[][] }
  /** A button; pressing it calls the plugin back with `actionId`. */
  | { type: 'button'; label: string; actionId: string }
  | { type: 'divider' }

/** Ceilings. A plugin that means well never reaches them; a broken loop does. */
const MAX_BLOCKS = 200
const MAX_TEXT = 2000
const MAX_ITEMS = 200
const MAX_ROWS = 200
const MAX_COLS = 20

function text(value: unknown, max = MAX_TEXT): string {
  if (typeof value === 'string') return value.slice(0, max)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function strings(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.slice(0, max).map((v) => text(v)) : []
}

function one(raw: unknown): PluginBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  switch (b.type) {
    case 'heading':
    case 'text': {
      const value = text(b.text)
      return value ? { type: b.type, text: value } : null
    }
    case 'list': {
      const items = strings(b.items, MAX_ITEMS)
      return items.length ? { type: 'list', items, ordered: b.ordered === true } : null
    }
    case 'table': {
      const rows = Array.isArray(b.rows)
        ? b.rows.slice(0, MAX_ROWS).map((r) => strings(r, MAX_COLS))
        : []
      if (!rows.length) return null
      const headers = strings(b.headers, MAX_COLS)
      return headers.length ? { type: 'table', headers, rows } : { type: 'table', rows }
    }
    case 'button': {
      const label = text(b.label, 80)
      const actionId = text(b.actionId, 120)
      return label && actionId ? { type: 'button', label, actionId } : null
    }
    case 'divider':
      return { type: 'divider' }
    default:
      return null
  }
}

/** Coerce whatever a plugin returned into blocks the host can render. Unknown or
 *  malformed blocks are dropped rather than rendered half-built. */
export function sanitizeBlocks(input: unknown): PluginBlock[] {
  if (!Array.isArray(input)) return []
  const out: PluginBlock[] = []
  for (const raw of input.slice(0, MAX_BLOCKS)) {
    const block = one(raw)
    if (block) out.push(block)
  }
  return out
}
