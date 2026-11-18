// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Last "Test connection" outcome per AI section, so a section can say "Connected ·
// tested 2 min ago" instead of the result vanishing with its toast. A result only
// counts while the section still points at what was tested (provider + URL + model);
// change any of them and it reads "Not tested" again. Module store + localStorage,
// like lib/toast.ts — a boot-time convenience, never a source of truth.

import { useSyncExternalStore } from 'react'
import type { TestTarget } from '../../core/ai'

export interface TestRecord {
  ok: boolean
  at: number
  /** provider|baseUrl|model at test time. */
  signature: string
}

const KEY = 'jnana.ai.connectionStatus'
let records: Partial<Record<TestTarget, TestRecord>> = load()
const listeners = new Set<() => void>()

function load(): Partial<Record<TestTarget, TestRecord>> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const out: Partial<Record<TestTarget, TestRecord>> = {}
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw)) {
        const r = v as Partial<TestRecord> | null
        if (r && typeof r.ok === 'boolean' && typeof r.at === 'number' && Number.isFinite(r.at) && typeof r.signature === 'string')
          out[k as TestTarget] = { ok: r.ok, at: r.at, signature: r.signature }
      }
    }
    return out
  } catch {
    return {}
  }
}

export const connectionSignature = (provider: string, baseUrl: string, model: string) =>
  `${provider}|${baseUrl.trim().replace(/\/+$/, '')}|${model.trim()}`

export function recordConnectionTest(target: TestTarget, ok: boolean, signature: string): void {
  records = { ...records, [target]: { ok, at: Date.now(), signature } }
  try {
    localStorage.setItem(KEY, JSON.stringify(records))
  } catch {
    /* storage unavailable — the status just won't survive a restart */
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useConnectionRecord(target: TestTarget | undefined): TestRecord | undefined {
  const all = useSyncExternalStore(subscribe, () => records, () => records)
  return target ? all[target] : undefined
}

/** "just now" / "5 min ago" / "3 h ago" / a date. */
export function testedAgo(at: number, now = Date.now()): string {
  const min = Math.round((now - at) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  return new Date(at).toLocaleDateString()
}
