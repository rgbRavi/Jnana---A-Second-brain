// Rust-calling service for Theme Studio persistence. Mirrors the invoke
// pattern in core/ai/config.ts, but themes are opaque JSON blobs (like canvas
// `data` / conversation `messages`) rather than a typed Rust struct.

import { invoke } from '@tauri-apps/api/core'
import type { SavedTheme, Theme } from '../types'

interface ThemeRow {
  id: string
  name: string
  json: string
  isBuiltin: boolean
  createdAt: number
}

function toSaved(row: ThemeRow): SavedTheme {
  return { id: row.id, name: row.name, theme: JSON.parse(row.json) as Theme, isBuiltin: row.isBuiltin, createdAt: row.createdAt }
}

export async function listThemes(): Promise<SavedTheme[]> {
  const rows = await invoke<ThemeRow[]>('list_themes')
  return rows.map(toSaved)
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
  return json ? (JSON.parse(json) as Theme) : null
}

export async function setActiveTheme(theme: Theme): Promise<void> {
  await invoke('set_active_theme', { json: JSON.stringify(theme) })
}
