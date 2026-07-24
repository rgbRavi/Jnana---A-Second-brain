// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Persistent, app-wide "General / Behaviour" preferences. Module-level store
// backed by localStorage, read reactively via useSyncExternalStore — same
// pattern as useComposerOptions.

import { useSyncExternalStore } from 'react'

export type StartupView = 'last' | '/' | '/notes' | '/search' | '/ai' | '/graph' | '/workspaces'
export type DateFormat = 'locale' | 'iso' | 'us' | 'eu'

export interface GeneralOptions {
  /** Which view opens on launch. 'last' restores the last route (current behaviour). */
  startupView: StartupView
  /** Ask before deleting a note. */
  confirmBeforeDelete: boolean
  /** How dates render app-wide (see core/dateFormat.ts). */
  dateFormat: DateFormat
  /** First day of the week for any calendar/among-week UI. */
  weekStart: 'sunday' | 'monday'
}

const STORAGE_KEY = 'jnana.general.options'
const DEFAULTS: GeneralOptions = {
  startupView: 'last',
  confirmBeforeDelete: true,
  dateFormat: 'locale',
  weekStart: 'monday',
}

function load(): GeneralOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<GeneralOptions>) }
  } catch {
    return DEFAULTS
  }
}

let options: GeneralOptions = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
}

export function setGeneralSettings(patch: Partial<GeneralOptions>): void {
  options = { ...options, ...patch }
  persist()
  listeners.forEach((l) => l())
}

export function getGeneralSettings(): GeneralOptions {
  return options
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => options

export function useGeneralSettings(): [GeneralOptions, (patch: Partial<GeneralOptions>) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return [value, setGeneralSettings]
}
