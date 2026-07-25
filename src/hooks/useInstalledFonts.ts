// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Module store for user-installed fonts (same useSyncExternalStore + module-state
// pattern as useTheme). On change it (1) injects the @font-face rules, (2) refreshes
// the family→stack registry that fontStack reads, and (3) re-applies the active
// theme so a `--font-*` bound to a just-(un)installed family re-resolves. Mounted
// once in AppLayout so fonts load at boot.

import { useEffect, useSyncExternalStore } from 'react'
import { toast, updateToast } from '../lib/toast'
import { installFonts, listFonts, removeFont, type InstalledFont } from '../core/fonts'
import { applyFaceCss } from '../core/fonts/loadFaces'
import { setInstalledStacks } from '../core/fonts/registry'
import { reapplyActiveTheme } from './useTheme'

let fonts: InstalledFont[] = []
const listeners = new Set<() => void>()
let hydrated = false

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
    console.error('[useInstalledFonts] hydrate failed', err)
  }
}

async function install(paths: string[]): Promise<void> {
  const id = toast.progress('Installing fonts…')
  try {
    const added = await installFonts(paths)
    apply(await listFonts())
    const names = added.map((f) => f.family).join(', ')
    updateToast(id, { message: `Installed ${names}`, variant: 'success', duration: 3000 })
  } catch (err) {
    updateToast(id, { message: `Font install failed: ${String(err)}`, variant: 'error', duration: 5000 })
  }
}

async function remove(id: string): Promise<void> {
  try {
    await removeFont(id)
    apply(await listFonts())
  } catch (err) {
    toast.error(`Failed to remove font: ${String(err)}`)
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export interface UseInstalledFontsApi {
  fonts: InstalledFont[]
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
  useEffect(() => {
    void hydrate()
  }, [])
  return { fonts: list, install, remove, refresh: () => listFonts().then(apply) }
}
