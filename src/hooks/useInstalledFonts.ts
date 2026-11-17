// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Module store for user-installed fonts (same useSyncExternalStore + module-state
// pattern as useTheme). On change it (1) injects the @font-face rules, (2) refreshes
// the family→stack registry that fontStack reads, and (3) re-applies the active
// theme so a `--font-*` bound to a just-(un)installed family re-resolves. Mounted
// once in AppLayout so fonts load at boot.

import { useEffect, useSyncExternalStore } from 'react'
import { toast, updateToast } from '../lib/toast'
import { logEvent } from '../lib/logger'
import { plural } from '../lib/plural'
import { installFonts, listFonts, removeFont, type InstalledFont } from '../core/fonts'
import { applyFaceCss } from '../core/fonts/loadFaces'
import { setInstalledStacks } from '../core/fonts/registry'
import { reapplyActiveTheme } from './useTheme'

let fonts: InstalledFont[] = []
const listeners = new Set<() => void>()
let hydrated = false
let installing = false

function notify(): void {
  listeners.forEach((l) => l())
}

/** Point the registry + faces + active theme at `next`, then notify subscribers. */
function apply(next: InstalledFont[]): void {
  fonts = next
  setInstalledStacks(fonts) // registry first, so fontStack sees the families…
  applyFaceCss(fonts) // …then make the faces loadable…
  reapplyActiveTheme() // …then re-resolve --font-* against them.
  notify()
}

async function hydrate(): Promise<void> {
  if (hydrated) return
  hydrated = true
  try {
    apply(await listFonts())
  } catch (err) {
    hydrated = false
    logEvent('error', 'fonts', 'hydrate failed', { error: err })
  }
}

async function install(paths: string[]): Promise<void> {
  if (installing) return
  installing = true
  notify()
  const id = toast.progress('Installing fonts…')
  try {
    const added = await installFonts(paths)
    apply(await listFonts())
    if (added.length === 0) {
      updateToast(id, { message: 'No new fonts found in that file.', variant: 'info', duration: 4000 })
    } else {
      const message =
        added.length <= 3
          ? `Installed ${added.map((f) => f.family).join(', ')}`
          : `Installed ${plural(added.length, 'font')}`
      updateToast(id, { message, variant: 'success', duration: 3000 })
    }
  } catch (err) {
    logEvent('error', 'fonts', 'font install failed', { error: err })
    updateToast(id, { message: "Couldn't install those fonts. Check they're valid font files.", variant: 'error', duration: 5000 })
  } finally {
    installing = false
    notify()
  }
}

async function remove(id: string): Promise<void> {
  try {
    await removeFont(id)
    apply(await listFonts())
  } catch (err) {
    logEvent('error', 'fonts', 'font remove failed', { error: err })
    toast.error("Couldn't remove that font. Try again.")
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export interface UseInstalledFontsApi {
  fonts: InstalledFont[]
  /** True while an install is running. */
  installing: boolean
  install: (paths: string[]) => Promise<void>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useInstalledFonts(): UseInstalledFontsApi {
  const list = useSyncExternalStore(
    subscribe,
    () => fonts,
    () => fonts,
  )
  const busy = useSyncExternalStore(
    subscribe,
    () => installing,
    () => installing,
  )
  useEffect(() => {
    void hydrate()
  }, [])
  return { fonts: list, installing: busy, install, remove, refresh: () => listFonts().then(apply) }
}
