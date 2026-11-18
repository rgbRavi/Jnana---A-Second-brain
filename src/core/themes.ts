// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Rust-calling service for Theme Studio persistence. Mirrors the invoke
// pattern in core/ai/config.ts, but themes are opaque JSON blobs (like canvas
// `data` / conversation `messages`) rather than a typed Rust struct.

import { invoke } from './ipc'
import type { SavedTheme, Theme } from '../types'
import { logEvent } from '../lib/logger'
import { sanitizeUserTheme } from './themes/sanitize'

interface ThemeRow {
  id: string
  name: string
  json: string
  isBuiltin: boolean
  createdAt: number
}

/** One bad row must not take the whole list down: it parses to null and is skipped. */
function toSaved(row: ThemeRow): SavedTheme | null {
  try {
    const theme = sanitizeUserTheme(row.json)
    if (!theme) return null
    return { id: row.id, name: String(row.name).slice(0, 80), theme, isBuiltin: row.isBuiltin, createdAt: row.createdAt }
  } catch {
    return null
  }
}

export async function listThemes(): Promise<SavedTheme[]> {
  const rows = await invoke<ThemeRow[]>('list_themes')
  const out: SavedTheme[] = []
  let skipped = 0
  for (const r of rows) {
    const s = toSaved(r)
    if (s) out.push(s)
    else skipped++
  }
  if (skipped > 0) logEvent('warn', 'themes', `Skipped ${skipped} unreadable saved theme(s)`)
  return out
}

export async function saveTheme(saved: SavedTheme): Promise<void> {
  const row: ThemeRow = {
    id: saved.id,
    name: saved.name,
    json: JSON.stringify(saved.theme),
    isBuiltin: saved.isBuiltin,
    createdAt: saved.createdAt,
  }
  await invoke('save_theme', { theme: row })
}

export async function deleteTheme(id: string): Promise<void> {
  await invoke('delete_theme', { id })
}

export async function getActiveTheme(): Promise<Theme | null> {
  const json = await invoke<string | null>('get_active_theme')
  return json ? sanitizeUserTheme(json) : null
}

export async function setActiveTheme(theme: Theme): Promise<void> {
  await invoke('set_active_theme', { json: JSON.stringify(theme) })
}
