// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Persistent, app-wide "General / Behaviour" preferences. Module-level store
// backed by localStorage, read reactively via useSyncExternalStore — same
// pattern as useComposerOptions.

import { useSyncExternalStore } from 'react'

export type StartupView = 'last' | '/' | '/notes' | '/ai' | '/graph' | '/workspaces'
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
  /** Days a trashed note is kept before automatic purge. 0 = keep forever. */
  trashRetentionDays: number
  /** Folder a live Markdown copy of every note is written to (core/mirror.ts). null = off. */
  mirrorDir: string | null
  /** Show the floating plugin-widgets button (bottom-right). Off: widgets open from the command palette. */
  showWidgetButton: boolean
  /** Hide that button while a text field or the editor has focus, so it never covers what you type. */
  autoHideWidgetButton: boolean
  /** Reveal developer-only surfaces in Settings (Developer tab, AI metrics, unfinished strategies). */
  showDeveloperOptions: boolean
}

const STORAGE_KEY = 'jnana.general.options'
const DEFAULTS: GeneralOptions = {
  startupView: 'last',
  confirmBeforeDelete: true,
  dateFormat: 'locale',
  weekStart: 'monday',
  trashRetentionDays: 30,
  mirrorDir: null,
  showWidgetButton: true,
  autoHideWidgetButton: false,
  showDeveloperOptions: false,
}

function load(): GeneralOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const opts = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<GeneralOptions>) }
    // The Search page became the command palette; a stored '/search' start falls back.
    if ((opts.startupView as string) === '/search') opts.startupView = 'last'
    return opts
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
