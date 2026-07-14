// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useSyncExternalStore } from 'react'
import { subscribeEnabled, getDisabledSnapshot } from '../../../lib/pluginEnabled'
import { subscribePluginLog, getPluginLog, type PluginLogEntry } from '../../../lib/pluginLog'
import { DEFAULT_CATALOG_URL } from '../../../core/plugins/catalog'

// ── Persisted active subview (module store + localStorage, like useComposerOptions) ──

export type PluginSubview = 'installed' | 'browse' | 'updates' | 'developer'

const KEY = 'jnana.plugins.subview.v1'
const SUBVIEWS: PluginSubview[] = ['installed', 'browse', 'updates', 'developer']

function loadSubview(): PluginSubview {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw && (SUBVIEWS as string[]).includes(raw)) return raw as PluginSubview
  } catch {
    // ignore
  }
  return 'installed'
}

let subview: PluginSubview = loadSubview()
const listeners = new Set<() => void>()

export function setPluginSubview(next: PluginSubview): void {
  if (next === subview) return
  subview = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
}

export function usePluginSubview(): PluginSubview {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => subview,
  )
}

// ── Persisted catalog URL (Browse / Updates) ──

const CATALOG_KEY = 'jnana.plugins.catalogUrl.v1'
let catalogUrl: string = (() => {
  try {
    return localStorage.getItem(CATALOG_KEY) ?? DEFAULT_CATALOG_URL
  } catch {
    return DEFAULT_CATALOG_URL
  }
})()
const catalogListeners = new Set<() => void>()

export function setCatalogUrl(url: string): void {
  catalogUrl = url
  try {
    localStorage.setItem(CATALOG_KEY, url)
  } catch {
    // ignore
  }
  catalogListeners.forEach((l) => l())
}

export function useCatalogUrl(): string {
  return useSyncExternalStore(
    (l) => {
      catalogListeners.add(l)
      return () => catalogListeners.delete(l)
    },
    () => catalogUrl,
  )
}

// ── Reactive views over the enabled + log stores ──

export function useDisabledPlugins(): Set<string> {
  return useSyncExternalStore(subscribeEnabled, getDisabledSnapshot)
}

export function usePluginLog(): PluginLogEntry[] {
  return useSyncExternalStore(subscribePluginLog, getPluginLog)
}
