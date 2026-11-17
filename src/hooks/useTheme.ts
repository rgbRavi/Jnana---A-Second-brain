// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Theme Studio's active-theme store. Module-level state + useSyncExternalStore
// (same pattern as useComposerOptions/useDashboardPrefs), but the source of
// truth is SQLite (via core/themes.ts) rather than localStorage alone — the
// localStorage mirror only exists so main.tsx can apply a theme synchronously
// on boot, before the SQLite round-trip resolves (no flash of default).

import { useEffect, useSyncExternalStore } from 'react'
import type { SavedTheme, Theme } from '../types'
import { eventBus } from '../lib/eventBus'
import { toast } from '../lib/toast'
import { logEvent } from '../lib/logger'
import { registerCloseFlush } from '../core/closeGuard'
import { applyVars, THEME_STORAGE_KEY } from '../core/themes/apply'
import { PRESETS, swapBase, themeFromPreset } from '../core/themes/presets'
import { MAX_THEME_NAME, sanitizeUserTheme } from '../core/themes/sanitize'
import { sanitizeTokens } from '../lib/pluginThemes'
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
    const t = raw ? sanitizeUserTheme(raw) : null
    if (t) return t
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
/** Bumped on every applied theme change, so a deferred action (Reset's Undo) can
 *  tell whether anything changed since. */
let themeVersion = 0
export const getThemeVersion = () => themeVersion

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

function persistNow(t: Theme): Promise<void> {
  return persistActiveTheme(t).catch((err) => {
    toast.error("Couldn't save your theme. It's applied for now, but may reset when Jnana restarts.")
    logEvent('error', 'theme', 'failed to persist active theme', { error: err })
  })
}

function schedulePersist(t: Theme): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = undefined
    void persistNow(t)
  }, 400)
}

// Closing the window skips unmounts, so a pending debounce would be lost.
registerCloseFlush(async () => {
  if (!persistTimer) return
  clearTimeout(persistTimer)
  persistTimer = undefined
  await persistNow(theme)
})

/** Apply `next`; the module state only changes if applying succeeded, so a bad
 *  theme can never poison the store. Returns whether it was applied. */
function commit(next: Theme): boolean {
  try {
    applyVars(document.documentElement, next)
  } catch (err) {
    logEvent('error', 'theme', 'theme could not be applied', { error: err })
    toast.error("That theme couldn't be applied. Your current theme is unchanged.")
    return false
  }
  theme = next
  themeVersion++
  persistMirror(theme)
  eventBus.emit('theme:changed', theme)
  schedulePersist(theme)
  notify()
  return true
}

/** First-use bootstrap: seed built-in presets (once) and reconcile with the
 *  SQLite-stored active theme, which is the source of truth over the mirror. */
async function hydrate(): Promise<void> {
  if (hydrated) return
  hydrated = true
  try {
    let rows = await listThemes()
    // Seed built-in presets. On a fresh install nothing is stored, so seed all;
    // on an existing install, add only the presets that aren't stored yet — this
    // is how a new/updated built-in theme reaches users who seeded an older set
    // (it never overwrites a stored theme, so user edits are untouched). A
    // deliberately-deleted built-in will re-appear on next launch, which is the
    // accepted trade-off for keeping the default lineup in sync.
    const stored = new Set(rows.map((r) => r.id))
    const missing = PRESETS.filter((p) => !stored.has(p.id))
    if (missing.length > 0) {
      const now = Date.now()
      for (const p of missing) {
        await persistSavedTheme({ id: p.id, name: p.name, theme: themeFromPreset(p.id), isBuiltin: true, createdAt: now })
      }
      rows = await listThemes()
    }
    savedThemes = rows

    const active = await getActiveTheme()
    if (active) {
      applyVars(document.documentElement, active)
      theme = active
      themeVersion++
      persistMirror(theme)
    } else {
      // True first run — nothing stored yet; persist the current (Midnight) theme.
      schedulePersist(theme)
    }
    notify()
  } catch (err) {
    hydrated = false // allow a retry on the next mount
    toast.error("Couldn't load your saved themes. Restart Jnana if they don't appear.")
    logEvent('error', 'theme', 'hydrate failed', { error: err })
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Re-apply the active theme's vars onto :root. Used after installed fonts
 *  hydrate so a theme referencing a user font resolves its `--font-*` once the
 *  family becomes known (at boot the font registry is still empty). */
export function reapplyActiveTheme(): void {
  applyVars(document.documentElement, theme)
}

const getThemeSnapshot = () => theme
const getSavedSnapshot = () => savedThemes

function setToken(k: keyof Theme['tokens'], v: string): void {
  // Same value grammar as imports: the editors only produce valid values, but this
  // is the store's public setter, so it enforces it rather than trusting callers.
  const clean = sanitizeTokens({ [k]: v })[k]
  if (clean === undefined) return
  commit({ ...theme, tokens: { ...theme.tokens, [k]: clean }, presetId: null })
}

function patch(obj: Partial<Pick<Theme, 'density' | 'readingScale'>>): void {
  commit({ ...theme, ...obj, presetId: null })
}

/** A look preference layered on any palette — toggling it doesn't turn a preset
 *  into "Custom", and switching presets keeps it (see pickPreset/reset). */
/** Set or clear the user's background image. `null` removes it, which also lets
 *  a plugin's backdrop show again (the wallpaper takes precedence while set). */
function setWallpaper(w: Theme['wallpaper']): void {
  commit({ ...theme, wallpaper: w ?? null })
}

function setGlassEffects(on: boolean): void {
  commit({ ...theme, glassEffects: on })
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
  commit({ ...themeFromPreset(id), glassEffects: theme.glassEffects })
}

/** Validate + merge pasted/plugin theme data over the defaults (see
 *  core/themes/sanitize.ts). Returns false — changing nothing — if it isn't a theme. */
function importTheme(input: unknown): boolean {
  const t = sanitizeUserTheme(input)
  return t ? commit(t) : false
}

function reset(): void {
  commit({ ...themeFromPreset('dark'), glassEffects: theme.glassEffects })
}

/** Save the current theme under `name`. `replaceId` overwrites that custom theme in place. */
async function saveCurrent(name: string, replaceId?: string): Promise<void> {
  const trimmed = name.trim().slice(0, MAX_THEME_NAME)
  if (!trimmed) throw new Error('Theme name is empty')
  const prev = replaceId ? savedThemes.find((s) => s.id === replaceId && !s.isBuiltin) : undefined
  const saved: SavedTheme = {
    id: prev?.id ?? crypto.randomUUID(),
    name: trimmed,
    theme: { ...theme, name: trimmed, presetId: null },
    isBuiltin: false,
    createdAt: prev?.createdAt ?? Date.now(),
  }
  await persistSavedTheme(saved)
  savedThemes = prev ? savedThemes.map((s) => (s.id === prev.id ? saved : s)) : [...savedThemes, saved]
  notify()
}

function loadSaved(id: string): void {
  const found = savedThemes.find((s) => s.id === id)
  const t = found && sanitizeUserTheme(found.theme)
  if (t) commit(t)
  else toast.error("That theme couldn't be applied. Your current theme is unchanged.")
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
  setGlassEffects: (on: boolean) => void
  setWallpaper: (w: Theme['wallpaper']) => void
  patch: (obj: Partial<Pick<Theme, 'density' | 'readingScale'>>) => void
  pickPreset: (id: string) => void
  importTheme: (input: unknown) => boolean
  reset: () => void
  saveCurrent: (name: string, replaceId?: string) => Promise<void>
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
    setGlassEffects,
    setWallpaper,
    patch,
    pickPreset,
    importTheme,
    reset,
    saveCurrent,
    loadSaved,
    deleteSaved,
  }
}
