// Theme Studio's active-theme store. Module-level state + useSyncExternalStore
// (same pattern as useComposerOptions/useDashboardPrefs), but the source of
// truth is SQLite (via core/themes.ts) rather than localStorage alone — the
// localStorage mirror only exists so main.tsx can apply a theme synchronously
// on boot, before the SQLite round-trip resolves (no flash of default).

import { useEffect, useSyncExternalStore } from 'react'
import type { SavedTheme, Theme } from '../types'
import { eventBus } from '../lib/eventBus'
import { toast } from '../lib/toast'
import { applyVars, THEME_STORAGE_KEY } from '../core/themes/apply'
import { PRESETS, swapBase, themeFromPreset } from '../core/themes/presets'
import {
  deleteTheme as persistDeleteTheme,
  getActiveTheme,
  listThemes,
  saveTheme as persistSavedTheme,
  setActiveTheme as persistActiveTheme,
} from '../core/themes'

function loadMirror(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Theme
  } catch {
    /* corrupt mirror — fall through to default */
  }
  return themeFromPreset('dark')
}

let theme: Theme = loadMirror()
let savedThemes: SavedTheme[] = []
const listeners = new Set<() => void>()
let hydrated = false
let persistTimer: ReturnType<typeof setTimeout> | undefined

function notify(): void {
  listeners.forEach((l) => l())
}

function persistMirror(t: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(t))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
}

function schedulePersist(t: Theme): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void persistActiveTheme(t).catch((err) => {
      toast.error('Failed to save your theme')
      console.error('[useTheme] failed to persist active theme', err)
    })
  }, 400)
}

function commit(next: Theme): void {
  theme = next
  applyVars(document.documentElement, theme)
  persistMirror(theme)
  eventBus.emit('theme:changed', theme)
  schedulePersist(theme)
  notify()
}

/** First-use bootstrap: seed built-in presets (once) and reconcile with the
 *  SQLite-stored active theme, which is the source of truth over the mirror. */
async function hydrate(): Promise<void> {
  if (hydrated) return
  hydrated = true
  try {
    let rows = await listThemes()
    if (rows.length === 0) {
      const now = Date.now()
      for (const p of PRESETS) {
        await persistSavedTheme({ id: p.id, name: p.name, theme: themeFromPreset(p.id), isBuiltin: true, createdAt: now })
      }
      rows = await listThemes()
    }
    savedThemes = rows

    const active = await getActiveTheme()
    if (active) {
      theme = active
      applyVars(document.documentElement, theme)
      persistMirror(theme)
    } else {
      // True first run — nothing stored yet; persist the current (Midnight) theme.
      schedulePersist(theme)
    }
    notify()
  } catch (err) {
    toast.error('Failed to load saved themes')
    console.error('[useTheme] hydrate failed', err)
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getThemeSnapshot = () => theme
const getSavedSnapshot = () => savedThemes

function setToken(k: keyof Theme['tokens'], v: string): void {
  commit({ ...theme, tokens: { ...theme.tokens, [k]: v }, presetId: null })
}

function patch(obj: Partial<Pick<Theme, 'density' | 'readingScale'>>): void {
  commit({ ...theme, ...obj, presetId: null })
}

function setBase(base: Theme['base']): void {
  commit(swapBase(theme, base))
}

function setFont(role: keyof Theme['fonts'], id: string): void {
  commit({ ...theme, fonts: { ...theme.fonts, [role]: id }, presetId: null })
}

/** Sets --radius-md to `v` and derives sm/lg from it (sm = v*0.6, lg = v*1.45). */
function setRadius(v: number): void {
  commit({
    ...theme,
    presetId: null,
    tokens: {
      ...theme.tokens,
      '--radius-sm': `${Math.round(v * 0.6)}px`,
      '--radius-md': `${v}px`,
      '--radius-lg': `${Math.round(v * 1.45)}px`,
    },
  })
}

function pickPreset(id: string): void {
  commit(themeFromPreset(id))
}

/** Merge a (possibly partial, e.g. from pasted JSON) theme object over the
 *  Midnight defaults so every token is always present. */
function importTheme(obj: Partial<Theme>): void {
  const base = themeFromPreset('dark')
  commit({
    ...base,
    ...obj,
    tokens: { ...base.tokens, ...obj.tokens },
    fonts: { ...base.fonts, ...obj.fonts },
    presetId: obj.presetId ?? null,
  })
}

function reset(): void {
  commit(themeFromPreset('dark'))
}

async function saveCurrent(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const id = crypto.randomUUID()
  const saved: SavedTheme = { id, name: trimmed, theme: { ...theme, name: trimmed, presetId: null }, isBuiltin: false, createdAt: Date.now() }
  await persistSavedTheme(saved)
  savedThemes = [...savedThemes, saved]
  notify()
}

function loadSaved(id: string): void {
  const found = savedThemes.find((s) => s.id === id)
  if (found) commit(found.theme)
}

async function deleteSaved(id: string): Promise<void> {
  await persistDeleteTheme(id)
  savedThemes = savedThemes.filter((s) => s.id !== id)
  notify()
}

export interface UseThemeApi {
  theme: Theme
  savedThemes: SavedTheme[]
  setToken: (k: keyof Theme['tokens'], v: string) => void
  setBase: (base: Theme['base']) => void
  setFont: (role: keyof Theme['fonts'], id: string) => void
  setRadius: (v: number) => void
  patch: (obj: Partial<Pick<Theme, 'density' | 'readingScale'>>) => void
  pickPreset: (id: string) => void
  importTheme: (obj: Partial<Theme>) => void
  reset: () => void
  saveCurrent: (name: string) => Promise<void>
  loadSaved: (id: string) => void
  deleteSaved: (id: string) => Promise<void>
}

export function useTheme(): UseThemeApi {
  const t = useSyncExternalStore(subscribe, getThemeSnapshot, getThemeSnapshot)
  const saved = useSyncExternalStore(subscribe, getSavedSnapshot, getSavedSnapshot)

  useEffect(() => {
    void hydrate()
  }, [])

  return {
    theme: t,
    savedThemes: saved,
    setToken,
    setBase,
    setFont,
    setRadius,
    patch,
    pickPreset,
    importTheme,
    reset,
    saveCurrent,
    loadSaved,
    deleteSaved,
  }
}
