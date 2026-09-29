// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// User policy for what kind of third-party plugin this install will run.
// Module store + localStorage, read synchronously at boot (before React) because
// the loader consults it while registering plugins.
//
// The worker runtime is a real boundary; the main-thread one cannot be. Jnana
// accepts both by default — but someone who wants the strict posture should be
// able to have it, and a plugin author should have a concrete reason to target the
// sandbox beyond a badge.

const KEY = 'jnana.plugins.sandboxOnly.v1'

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

let sandboxOnly = load()
const listeners = new Set<() => void>()

/** True when only `runtime: "worker"` third-party plugins may load. Built-in
 *  plugins are first-party code shipped with the app, so they're unaffected. */
export function isSandboxOnly(): boolean {
  return sandboxOnly
}

export function setSandboxOnly(value: boolean): void {
  if (value === sandboxOnly) return
  sandboxOnly = value
  try {
    localStorage.setItem(KEY, String(value))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

export function subscribeSandboxOnly(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSandboxOnlySnapshot(): boolean {
  return sandboxOnly
}

/** Why a plugin can't run under the current policy, or `null` if it can. */
export function policyRefusal(plugin: { name: string; runtime: string }): string | null {
  if (!sandboxOnly || plugin.runtime === 'worker') return null
  return `${plugin.name} runs on the main thread, and this install only allows sandboxed plugins.`
}
