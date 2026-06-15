// Persistent dashboard preferences (localStorage module store + useSyncExternalStore,
// same pattern as useComposerOptions). Phase 1 uses a single layout; the model
// already carries order + multiple layouts so Phase 2 (drag-reorder + saved
// layouts) only adds UI.

import { useSyncExternalStore } from 'react'
import {
  ALL_SECTIONS,
  DEFAULT_LAYOUT_ID,
  makeDefaultLayout,
  type DashboardLayout,
  type DashboardPrefs,
  type SectionId,
  type SectionSize,
} from './types'

const STORAGE_KEY = 'jnana.dashboard.prefs'

function defaults(): DashboardPrefs {
  return { layouts: [makeDefaultLayout()], activeLayoutId: DEFAULT_LAYOUT_ID }
}

/** Keep a layout's order in sync with ALL_SECTIONS: drop unknown ids, append new ones. */
function normalizeLayout(l: DashboardLayout): DashboardLayout {
  const known = new Set<SectionId>(ALL_SECTIONS)
  const order = l.order.filter((id) => known.has(id))
  for (const id of ALL_SECTIONS) if (!order.includes(id)) order.push(id)
  const sizes: Partial<Record<SectionId, SectionSize>> = {}
  for (const [k, v] of Object.entries(l.sizes ?? {})) {
    if (known.has(k as SectionId) && v) sizes[k as SectionId] = v
  }
  return {
    ...l,
    order,
    hidden: l.hidden.filter((id) => known.has(id)),
    collapsed: l.collapsed.filter((id) => known.has(id)),
    sizes,
  }
}

function load(): DashboardPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults()
    const parsed = JSON.parse(raw) as DashboardPrefs
    if (!parsed.layouts?.length) return defaults()
    const layouts = parsed.layouts.map(normalizeLayout)
    const activeLayoutId = layouts.some((l) => l.id === parsed.activeLayoutId)
      ? parsed.activeLayoutId
      : layouts[0].id
    return { layouts, activeLayoutId }
  } catch {
    return defaults()
  }
}

let prefs: DashboardPrefs = load()
const listeners = new Set<() => void>()

function commit(next: DashboardPrefs) {
  prefs = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const getSnapshot = () => prefs

function activeLayout(p: DashboardPrefs): DashboardLayout {
  return p.layouts.find((l) => l.id === p.activeLayoutId) ?? p.layouts[0]
}

function mutateActive(fn: (l: DashboardLayout) => DashboardLayout) {
  const active = activeLayout(prefs)
  const nextLayout = fn(active)
  commit({ ...prefs, layouts: prefs.layouts.map((l) => (l.id === active.id ? nextLayout : l)) })
}

const toggleInList = (list: SectionId[], id: SectionId) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

function setSize(l: DashboardLayout, id: SectionId, patch: SectionSize): DashboardLayout {
  const sizes = { ...(l.sizes ?? {}) }
  const next: SectionSize = { ...(sizes[id] ?? {}), ...patch }
  if (next.w === undefined && next.h === undefined) delete sizes[id]
  else sizes[id] = next
  return { ...l, sizes }
}

export interface DashboardPrefsApi {
  active: DashboardLayout
  isHidden: (id: SectionId) => boolean
  isCollapsed: (id: SectionId) => boolean
  toggleHidden: (id: SectionId) => void
  toggleCollapsed: (id: SectionId) => void
  getSize: (id: SectionId) => SectionSize
  /** Cycle a section's column span between full (2) and half (1). */
  toggleWidth: (id: SectionId) => void
  /** Set a section's body height in px (undefined → auto). */
  setHeight: (id: SectionId, h: number | undefined) => void
  /** Phase 2 (drag-reorder). */
  setOrder: (order: SectionId[]) => void
  resetLayout: () => void
}

export function useDashboardPrefs(): DashboardPrefsApi {
  const p = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const active = normalizeLayout(activeLayout(p))
  return {
    active,
    isHidden: (id) => active.hidden.includes(id),
    isCollapsed: (id) => active.collapsed.includes(id),
    toggleHidden: (id) => mutateActive((l) => ({ ...l, hidden: toggleInList(l.hidden, id) })),
    toggleCollapsed: (id) => mutateActive((l) => ({ ...l, collapsed: toggleInList(l.collapsed, id) })),
    getSize: (id) => active.sizes?.[id] ?? {},
    toggleWidth: (id) => mutateActive((l) => setSize(l, id, { w: (l.sizes?.[id]?.w ?? 2) === 1 ? 2 : 1 })),
    setHeight: (id, h) => mutateActive((l) => setSize(l, id, { h })),
    setOrder: (order) => mutateActive((l) => ({ ...l, order })),
    resetLayout: () => mutateActive(() => makeDefaultLayout()),
  }
}
