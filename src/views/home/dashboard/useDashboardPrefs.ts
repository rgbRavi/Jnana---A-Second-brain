// Persistent dashboard preferences (localStorage module store + useSyncExternalStore,
// same pattern as useComposerOptions). Phase 1 uses a single layout; the model
// already carries order + multiple layouts so Phase 2 (drag-reorder + saved
// layouts) only adds UI.

import { useSyncExternalStore } from 'react'
import {
  ALL_SECTIONS,
  COLUMN_COUNT,
  DEFAULT_LAYOUT_ID,
  distribute,
  PRESET_LAYOUTS,
  type DashboardLayout,
  type DashboardPrefs,
  type SectionId,
  type SectionSize,
} from './types'

const STORAGE_KEY = 'jnana.dashboard.prefs'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `layout-${Date.now()}`

/** Keep a layout's columns in sync with ALL_SECTIONS: drop unknown/dupes, ensure
 *  COLUMN_COUNT columns, append any new widgets to the shorter column. Migrates
 *  the legacy single `order` field into columns. */
function normalizeLayout(l: DashboardLayout): DashboardLayout {
  const known = new Set<SectionId>(ALL_SECTIONS)
  const legacyOrder = (l as unknown as { order?: SectionId[] }).order
  const source = l.columns ?? (legacyOrder ? distribute(legacyOrder.filter((id) => known.has(id))) : distribute(ALL_SECTIONS))

  const seen = new Set<SectionId>()
  const columns: SectionId[][] = source.map((col) =>
    (col ?? []).filter((id) => {
      if (!known.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    }),
  )
  while (columns.length < COLUMN_COUNT) columns.push([])
  // Append any sections not placed anywhere (e.g. new widgets) to the shortest column.
  for (const id of ALL_SECTIONS) {
    if (seen.has(id)) continue
    let shortest = 0
    for (let i = 1; i < columns.length; i++) if (columns[i].length < columns[shortest].length) shortest = i
    columns[shortest].push(id)
    seen.add(id)
  }

  const sizes: Partial<Record<SectionId, SectionSize>> = {}
  for (const [k, v] of Object.entries(l.sizes ?? {})) {
    if (known.has(k as SectionId) && v) sizes[k as SectionId] = v
  }
  return {
    ...l,
    columns,
    hidden: (l.hidden ?? []).filter((id) => known.has(id)),
    collapsed: (l.collapsed ?? []).filter((id) => known.has(id)),
    sizes,
  }
}

function load(): DashboardPrefs {
  let stored: DashboardPrefs | null = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) stored = JSON.parse(raw) as DashboardPrefs
  } catch {
    stored = null
  }
  // Built-in presets always exist (user edits to them are preserved); custom
  // layouts follow.
  const layouts: DashboardLayout[] = PRESET_LAYOUTS.map((p) => {
    const existing = stored?.layouts?.find((l) => l.id === p.id)
    return existing ? normalizeLayout({ ...existing, builtin: true }) : { ...p }
  })
  for (const l of stored?.layouts ?? []) {
    if (!PRESET_LAYOUTS.some((p) => p.id === l.id)) layouts.push(normalizeLayout(l))
  }
  const activeLayoutId = layouts.some((l) => l.id === stored?.activeLayoutId)
    ? (stored!.activeLayoutId as string)
    : DEFAULT_LAYOUT_ID
  return { layouts, activeLayoutId }
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

// ── Layout management (multiple saved layouts) ──
function switchLayout(id: string) {
  if (prefs.layouts.some((l) => l.id === id)) commit({ ...prefs, activeLayoutId: id })
}
function createLayout(name: string): string {
  const id = newId()
  const copy: DashboardLayout = { ...activeLayout(prefs), id, name: name.trim() || 'New layout', builtin: false }
  commit({ layouts: [...prefs.layouts, copy], activeLayoutId: id })
  return id
}
function renameLayout(id: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  commit({ ...prefs, layouts: prefs.layouts.map((l) => (l.id === id ? { ...l, name: trimmed } : l)) })
}
function deleteLayout(id: string) {
  const target = prefs.layouts.find((l) => l.id === id)
  if (!target || target.builtin) return
  const layouts = prefs.layouts.filter((l) => l.id !== id)
  const activeLayoutId = prefs.activeLayoutId === id ? DEFAULT_LAYOUT_ID : prefs.activeLayoutId
  commit({ layouts, activeLayoutId })
}

export interface LayoutMeta {
  id: string
  name: string
  builtin?: boolean
}

export interface DashboardPrefsApi {
  active: DashboardLayout
  layouts: LayoutMeta[]
  activeId: string
  isHidden: (id: SectionId) => boolean
  isCollapsed: (id: SectionId) => boolean
  toggleHidden: (id: SectionId) => void
  toggleCollapsed: (id: SectionId) => void
  getSize: (id: SectionId) => SectionSize
  /** Set a section's body height in px (undefined → auto). */
  setHeight: (id: SectionId, h: number | undefined) => void
  /** Persist a new column arrangement (drag-reorder). */
  setColumns: (columns: SectionId[][]) => void
  resetLayout: () => void
  switchLayout: (id: string) => void
  /** Save the current layout as a new named layout; returns its id. */
  createLayout: (name: string) => string
  renameLayout: (id: string, name: string) => void
  deleteLayout: (id: string) => void
}

export function useDashboardPrefs(): DashboardPrefsApi {
  const p = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const active = normalizeLayout(activeLayout(p))
  return {
    active,
    layouts: p.layouts.map((l) => ({ id: l.id, name: l.name, builtin: l.builtin })),
    activeId: active.id,
    isHidden: (id) => active.hidden.includes(id),
    isCollapsed: (id) => active.collapsed.includes(id),
    toggleHidden: (id) => mutateActive((l) => ({ ...l, hidden: toggleInList(l.hidden, id) })),
    toggleCollapsed: (id) => mutateActive((l) => ({ ...l, collapsed: toggleInList(l.collapsed, id) })),
    getSize: (id) => active.sizes?.[id] ?? {},
    setHeight: (id, h) => mutateActive((l) => setSize(l, id, { h })),
    setColumns: (columns) => mutateActive((l) => ({ ...l, columns })),
    resetLayout: () => mutateActive((l) => ({ ...l, columns: distribute(ALL_SECTIONS), hidden: [], collapsed: [], sizes: {} })),
    switchLayout,
    createLayout,
    renameLayout,
    deleteLayout,
  }
}
