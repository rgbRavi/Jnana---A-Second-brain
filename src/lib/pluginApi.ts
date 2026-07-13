// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Note } from '../types'
import type { PluginBus } from './eventBus'
import type { NoteTypeDefinition } from './noteTypes'
import type { PluginWidget, PluginCommand } from './pluginContributions'

/** UI a plugin can contribute beyond note types. */
export interface PluginUiApi {
  /** Add a widget panel to the plugin widget tray. */
  registerWidget: (widget: PluginWidget) => void
  /** Add an entry to the command palette. */
  registerCommand: (command: PluginCommand) => void
}

/**
 * Per-plugin, opaque-JSON key/value storage (backed by the Rust `plugin_kv`
 * table, v17). Scoped to the plugin's id — a plugin can't read another's keys.
 * Values are JSON-serialized for the caller.
 */
export interface PluginStorage {
  /** Read + JSON-parse a key, or `null` when absent. */
  get<T = unknown>(key: string): Promise<T | null>
  /** JSON-serialize + write a key. */
  set(key: string, value: unknown): Promise<void>
  /** Delete a key. */
  delete(key: string): Promise<void>
  /** All keys → raw JSON strings for this plugin. */
  list(): Promise<Record<string, string>>
}

/**
 * Scoped, permissioned access to notes for a plugin. Reads go through the same
 * Rust commands the app uses; `saveContent` writes a note's body back (and emits
 * `note:saved`), the one mutation a note-type editor needs.
 */
export interface PluginNotesApi {
  getAll(): Promise<Note[]>
  getById(id: string): Promise<Note | undefined>
  /** Replace a note's `content` (preserving title/tags/placement) and persist. */
  saveContent(noteId: string, content: string): Promise<void>
}

/**
 * The sandboxed context handed to an inline plugin's `init(ctx)`. Everything a
 * first-party plugin needs without reaching into `core/` directly: the event bus,
 * scoped storage, a scoped notes API, and note-type registration.
 */
export interface PluginContext {
  /** The plugin's own id (its storage/query scope). */
  pluginId: string
  /** Sandboxed event bus (can't emit core note/link/annotation events). */
  bus: PluginBus
  /** Per-plugin persistent storage. */
  storage: PluginStorage
  /** Scoped notes read + content-write API. Present only when the `notes`
   *  permission was granted (always present for trusted first-party plugins). */
  notes?: PluginNotesApi
  /** Register a custom note type (custom view + editor over a note). */
  registerNoteType: (def: NoteTypeDefinition) => void
  /** Contribute UI (widgets, commands). */
  ui: PluginUiApi
}

/** Options passed when registering a (non-trusted) loaded plugin. */
export interface PluginRegisterOptions {
  /** Permissions the user granted at install time; gates the context's `notes`. */
  grantedPermissions?: string[]
}
