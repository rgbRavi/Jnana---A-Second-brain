// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Registry for panels docked in the app-global right rail (ui/rail/RightRail.tsx).
// Same reactive pattern as pluginContributions.ts (version + subscribe) so the
// rail re-renders when a panel registers/unregisters. Core panels register at
// boot (registerBuiltinRailPanels); plugins can register their own later through
// the same API — the rail is the shared home for tool panels (the Table tools
// are the first, more to come).

import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface RailPanel {
  id: string
  /** Shown as the panel header and the icon-button tooltip. */
  title: string
  icon: LucideIcon
  /** Lower sorts earlier (icon order in the strip). Default 100. */
  order?: number
  /** Reactive availability — called as a hook per panel by the rail. Omit = always
   *  available. The Table panel gates on `useActiveTable().present`. */
  useAvailable?: () => boolean
  Component: ComponentType
}

const panels = new Map<string, RailPanel>()
let version = 0
const listeners = new Set<() => void>()

function changed(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function registerRailPanel(panel: RailPanel): void {
  panels.set(panel.id, panel)
  changed()
}

export function unregisterRailPanel(id: string): void {
  if (panels.delete(id)) changed()
}

export function listRailPanels(): RailPanel[] {
  return Array.from(panels.values()).sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
}

export function subscribeRailPanels(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRailPanelsVersion(): number {
  return version
}
