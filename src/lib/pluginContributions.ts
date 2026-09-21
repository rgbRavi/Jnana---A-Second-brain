// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Reactive registries for the UI a plugin can contribute beyond note types:
//  - widgets: a small panel (e.g. a Pomodoro timer) shown in the plugin widget tray
//  - commands: entries surfaced in the command palette
//  - block panels: a right-rail panel described as data and drawn by the host
//  - fences: a fenced code language a plugin turns into blocks
// Same reactive pattern as noteTypes (version + subscribe) so hosts re-render when a
// plugin registers/unregisters live. A plugin registers through `ctx.ui`; the
// registry tears these down when the plugin is unregistered.

import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { PluginBlockPanel, PluginFence, PluginSettingsDefinition } from './pluginApi'
import type { PluginBlock } from './pluginBlocks'
import { sanitizeBlocks } from './pluginBlocks'

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
  /** A suggested keyboard shortcut, e.g. `mod+shift+k` (`mod` = Ctrl/⌘). The user
   *  can rebind or disable it; app bindings always win (see lib/pluginHotkeys.ts). */
  hotkey?: string
  run: () => void
}

/** A block panel as stored: the plugin's declaration, already sanitized. */
export interface StoredBlockPanel {
  pluginId: string
  id: string
  title: string
  blocks: PluginBlock[]
  onAction?: (actionId: string) => void
}

/** A claimed fence language and the plugin that renders it. */
export interface StoredFence {
  pluginId: string
  lang: string
  render: (source: string) => PluginBlock[] | Promise<PluginBlock[]>
}

const widgets = new Map<string, PluginWidget>()
const commands = new Map<string, PluginCommand>()
const blockPanels = new Map<string, StoredBlockPanel>()
const fences = new Map<string, StoredFence>()
/** Settings panes, by plugin id — one per plugin, rendered on its card. */
const settings = new Map<string, PluginSettingsDefinition>()

let version = 0
const listeners = new Set<() => void>()

// Notifications are coalesced to one per microtask. The *store* updates
// synchronously (a caller that registers then reads sees its own write), but
// subscribers — the rail, the backdrop, the Settings panes — are told once per
// batch. Without this, a plugin redeclaring a panel in a loop re-renders the app
// once per call, which is a stutter no rate limit can fully hide.
let pending = false

function changed(): void {
  version += 1
  if (pending) return
  pending = true
  queueMicrotask(() => {
    pending = false
    listeners.forEach((l) => l())
  })
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

/** Declare (or replace) a plugin's settings pane. */
export function registerSettings(pluginId: string, definition: PluginSettingsDefinition): void {
  settings.set(pluginId, definition)
  changed()
}

export function unregisterSettings(pluginId: string): void {
  if (settings.delete(pluginId)) changed()
}

export function getSettingsDefinition(pluginId: string): PluginSettingsDefinition | undefined {
  return settings.get(pluginId)
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

// ── Block panels (right-rail panels described as data) ──

/** Declare or replace a block panel. Re-registering the same id is how a plugin
 *  updates its panel, so the blocks are re-sanitized every time. */
export function registerBlockPanel(pluginId: string, panel: PluginBlockPanel): void {
  blockPanels.set(panel.id, {
    pluginId,
    id: panel.id,
    title: panel.title || pluginId,
    blocks: sanitizeBlocks(panel.blocks),
    onAction: panel.onAction,
  })
  changed()
}

export function unregisterBlockPanel(id: string): void {
  if (blockPanels.delete(id)) changed()
}

export function listBlockPanels(): StoredBlockPanel[] {
  return Array.from(blockPanels.values())
}

// ── Fences (a plugin renders ```lang blocks) ──

/** Claim a fenced language. First claim wins: a second plugin asking for the same
 *  language is refused rather than silently shadowing the first. */
export function registerFence(pluginId: string, fence: PluginFence): boolean {
  const lang = fence.lang.trim().toLowerCase()
  if (!lang) return false
  const existing = fences.get(lang)
  if (existing && existing.pluginId !== pluginId) return false
  fences.set(lang, { pluginId, lang, render: fence.render })
  changed()
  return true
}

export function unregisterFence(lang: string): void {
  if (fences.delete(lang.trim().toLowerCase())) changed()
}

/** The plugin renderer for a fence language, if one claimed it. */
export function getFence(lang: string | undefined): StoredFence | undefined {
  return lang ? fences.get(lang.trim().toLowerCase()) : undefined
}
