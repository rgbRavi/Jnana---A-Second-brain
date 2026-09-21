// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { ComponentType } from 'react'
import type { Note } from '../types'
import type { NoteMedia } from '../core/markdown/noteMedia'
import type { PluginBlock } from './pluginBlocks'
import type { PluginBackground, PluginTheme } from './pluginThemes'
import type { PluginBus } from './eventBus'
import type { NoteTypeDefinition } from './noteTypes'
import type { PluginWidget, PluginCommand } from './pluginContributions'

/** One row in a plugin's settings pane. */
export interface PluginSettingField {
  /** Key in the plugin's stored settings object. */
  key: string
  label: string
  hint?: string
  type: 'toggle' | 'text' | 'select' | 'number'
  /** Starting value before the user changes anything. */
  default?: string | number | boolean
  /** Required for `select`. */
  options?: { value: string; label: string }[]
  /** For `number`: the slider's bounds. */
  min?: number
  max?: number
  step?: number
}

/**
 * A settings pane, rendered by Jnana in Settings → Plugins with the app's own
 * controls — so a plugin (including a worker plugin, which has no UI at all) can
 * be configured without inventing its own surface. Values are stored in the
 * plugin's own storage under `__settings`, so the plugin can read them there.
 */
export interface PluginSettingsDefinition {
  fields: PluginSettingField[]
  /** Called with the full settings object whenever the user changes something. */
  onChange?: (values: Record<string, unknown>) => void
}

/** UI a plugin can contribute beyond note types. */
export interface PluginUiApi {
  /** Add a widget panel to the plugin widget tray. Main-thread runtime only. */
  registerWidget: (widget: PluginWidget) => void
  /** Add an entry to the command palette. */
  registerCommand: (command: PluginCommand) => void
  /** Declare a settings pane. Works on both runtimes. */
  registerSettings: (definition: PluginSettingsDefinition) => void
  /**
   * Dock a panel in the app-global right rail — the surface with room to live in,
   * next to Note tools and Links. Main-thread runtime only (it renders React);
   * a worker plugin declares `registerBlockPanel` instead.
   */
  registerRailPanel: (panel: PluginRailPanel) => void
  /**
   * Dock a rail panel described as data. The host renders the blocks with its own
   * controls and calls `onAction` when a button block is pressed. Works on both
   * runtimes — it is how a sandboxed plugin reaches the best surface in the app.
   */
  registerBlockPanel: (panel: PluginBlockPanel) => void
  /**
   * Claim a fenced code language, e.g. ```` ```weather ````. When a note renders a
   * fence in that language the host calls `render` with its body and displays the
   * blocks that come back, instead of the code. Works on both runtimes for the
   * same reason as `registerBlockPanel`: the plugin returns data, not DOM.
   */
  registerFence: (fence: PluginFence) => void
  /**
   * Contribute a theme. It appears in Settings → Appearance next to the built-in
   * presets, and the user picks it like any other — a plugin never changes the
   * look of the app on its own. Tokens are **validated**: each one must parse as
   * a colour, length, duration or easing, and anything else is dropped, so a
   * theme can never smuggle in arbitrary CSS. Works on both runtimes.
   */
  registerTheme: (theme: PluginTheme) => void
  /**
   * Set an animated backdrop behind the app. The plugin supplies parameters and
   * the host draws it; pass `null` to clear. One background at a time — the last
   * plugin to set one wins, and it clears when that plugin unloads. Works on
   * both runtimes.
   */
  setBackground: (background: PluginBackground | null) => void
}

/** A right-rail panel that draws itself. Main-thread runtime only. */
export interface PluginRailPanel {
  id: string
  /** Panel header and icon tooltip. */
  title: string
  Component: ComponentType
}

/** A right-rail panel described as blocks, rendered by the host. */
export interface PluginBlockPanel {
  id: string
  title: string
  /** Blocks to show now. Registering the same id again replaces them, which is
   *  how a panel updates itself. */
  blocks: PluginBlock[]
  /** A `button` block was pressed. */
  onAction?: (actionId: string) => void
}

/** A fenced-code language a plugin renders. */
export interface PluginFence {
  /** The info string it claims, e.g. `weather` for ```` ```weather ````. */
  lang: string
  /** Turn the fence body into blocks. Errors fall back to the plain code block. */
  render: (source: string) => PluginBlock[] | Promise<PluginBlock[]>
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
 * Scoped, permissioned access to notes for a plugin.
 *
 * **Everything here is scoped to the active vault** — a vault is how someone keeps
 * separate things separate, so a plugin granted `notes` sees the vault in use, not
 * the whole database. Notes in other vaults are invisible to `getAll`/`search`,
 * `getById` returns `undefined` for them, and `saveContent` refuses.
 */
export interface PluginNotesApi {
  /** Every note in the active vault (trashed notes excluded). */
  getAll(): Promise<Note[]>
  /** One note, or `undefined` if it doesn't exist or is in another vault. */
  getById(id: string): Promise<Note | undefined>
  /** Case-insensitive title/content substring match within the active vault. */
  search(query: string): Promise<Note[]>
  /** Create a note in the active vault and return it as saved. */
  create(title: string, content?: string): Promise<Note>
  /** Replace a note's `content` (preserving title/tags/placement) and persist. */
  saveContent(noteId: string, content: string): Promise<void>
}

/**
 * Permissioned access to the attachments a note embeds — images, PDFs, audio,
 * video. Gated by the `media` permission, which is *separate* from `notes`: an
 * attachment is often a scan, a recording or a photo, so a plugin that reads
 * prose does not get them thrown in.
 *
 * `list` is scoped to the active vault like `ctx.notes`. `read` is capped at
 * 25 MB per file (enforced in Rust, on the file's metadata), so a plugin cannot
 * drag a large video through IPC.
 */
export interface PluginMediaApi {
  /** Every distinct attachment a note embeds, in document order. */
  list(noteId: string): Promise<NoteMedia[]>
  /** An asset's bytes, by the filename `list` reported for `source: 'asset'`. */
  read(filename: string): Promise<Uint8Array>
  /** Store bytes as a new asset and return its filename; embed it with
   *  `![](jnana-asset://<filename>)`. */
  write(bytes: Uint8Array, extension: string): Promise<string>
}

/** One plugin HTTP response, as text. */
export interface PluginNetResponse {
  /** True for a 2xx status. */
  ok: boolean
  status: number
  /** The response body, decoded as UTF-8 text (parse JSON yourself). */
  body: string
}

/**
 * Host-mediated HTTP for a plugin that was granted `network`. Requests go out
 * through Rust and are refused unless the URL's host is one the plugin's manifest
 * declared and the user approved — the permission alone reaches nothing. https
 * only; 30s timeout; 5 MB response ceiling; cookies are never attached.
 */
export interface PluginNetApi {
  request(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<PluginNetResponse>
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
  /** Host-mediated HTTP. Present only when the `network` permission was granted;
   *  each request is additionally checked against the manifest's declared hosts. */
  net?: PluginNetApi
  /** Note attachments. Present only when the `media` permission was granted. */
  media?: PluginMediaApi
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
