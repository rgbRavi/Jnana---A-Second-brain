// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Reactive registries for the UI a plugin can contribute beyond note types:
//  - widgets: a small panel (e.g. a Pomodoro timer) shown in the plugin widget tray
//  - commands: entries surfaced in the command palette
// Same reactive pattern as noteTypes (version + subscribe) so hosts re-render when a
// plugin registers/unregisters live. A plugin registers through `ctx.ui`; the
// registry tears these down when the plugin is unregistered.

import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface PluginWidget {
  id: string
  title: string
  icon?: LucideIcon
  Component: ComponentType
}

export interface PluginCommand {
  id: string
  label: string
  /** Emoji or short glyph shown in the palette (defaults to a plug). */
  icon?: string
  hint?: string
  run: () => void
}

const widgets = new Map<string, PluginWidget>()
const commands = new Map<string, PluginCommand>()

let version = 0
const listeners = new Set<() => void>()

function changed(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeContributions(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getContributionsVersion(): number {
  return version
}

export function registerWidget(widget: PluginWidget): void {
  widgets.set(widget.id, widget)
  changed()
}

export function unregisterWidget(id: string): void {
  if (widgets.delete(id)) changed()
}

export function listWidgets(): PluginWidget[] {
  return Array.from(widgets.values())
}

export function registerCommand(command: PluginCommand): void {
  commands.set(command.id, command)
  changed()
}

export function unregisterCommand(id: string): void {
  if (commands.delete(id)) changed()
}

export function listCommands(): PluginCommand[] {
  return Array.from(commands.values())
}
