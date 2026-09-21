// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

/**
 * Types for writing a Jnana plugin.
 *
 * Everything lives in the ambient `Jnana` namespace, so a plugin source file in
 * the same folder gets completion with no import and no tsconfig:
 *
 *   const plugin: Jnana.Plugin = { id: 'com.you.thing', name: 'Thing', version: '1.0.0',
 *     init(ctx) { ctx.ui.registerCommand({ id: 'thing.hi', label: 'Say hi', run: () => {} }) } }
 *   export default plugin
 *
 * Which members of `ctx` exist depends on the manifest: `notes` needs the `notes`
 * permission, `media` needs `media`, `net` needs `network` plus declared `hosts`,
 * and the rendering hooks (`registerNoteType`, `ui.registerWidget`,
 * `ui.registerRailPanel`) exist only on the main-thread runtime — calling them in a
 * `"runtime": "worker"` plugin throws. Everything declarative (`registerSettings`,
 * `registerBlockPanel`, `registerFence`) works on both runtimes.
 */
declare namespace Jnana {
  /** A note, as plugins see it. */
  interface Note {
    id: string
    title: string
    content: string
    tags: string[]
    createdAt: number
    updatedAt: number
    /** Set when the note belongs to a plugin-provided type. */
    kind?: string
    folderId?: string | null
    vaultId?: string
  }

  /** Per-plugin key/value storage. Values are JSON-serialized for you, and the
   *  store is scoped to your plugin id — you cannot read another plugin's keys.
   *  Limit: 5 MB per plugin. */
  interface PluginStorage {
    get<T = unknown>(key: string): Promise<T | null>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
    list(): Promise<Record<string, string>>
  }

  /** Requires the `notes` permission. Every call is scoped to the active vault:
   *  notes elsewhere are invisible, and a write to one is refused. */
  interface PluginNotesApi {
    getAll(): Promise<Note[]>
    getById(id: string): Promise<Note | undefined>
    /** Case-insensitive title/content substring match. */
    search(query: string): Promise<Note[]>
    /** Create a note in the active vault. */
    create(title: string, content?: string): Promise<Note>
    /** Replace a note's body (title, tags and placement are untouched). */
    saveContent(noteId: string, content: string): Promise<void>
  }

  /** One attachment a note embeds. */
  interface NoteMedia {
    kind: 'image' | 'video' | 'audio' | 'pdf' | 'webpage' | 'youtube' | 'document'
    label: string
    /** 'asset' is a file Jnana stores (pass `target` to `media.read`). */
    source: 'asset' | 'url' | 'path'
    target: string
  }

  /** Requires the `media` permission — separate from `notes`, because an
   *  attachment is often a scan, a photo or a recording. Reads are capped at
   *  25 MB per file. */
  interface PluginMediaApi {
    list(noteId: string): Promise<NoteMedia[]>
    read(filename: string): Promise<Uint8Array>
    /** Store bytes as a new asset; embed the returned filename with
     *  `![](jnana-asset://<filename>)`. */
    write(bytes: Uint8Array, extension: string): Promise<string>
  }

  /** One row of a settings pane. */
  interface PluginSettingField {
    key: string
    label: string
    hint?: string
    type: 'toggle' | 'text' | 'select' | 'number'
    default?: string | number | boolean
    /** Required for `select`. */
    options?: { value: string; label: string }[]
    min?: number
    max?: number
    step?: number
  }

  /** A settings pane Jnana renders with its own controls — the way a worker
   *  plugin, which has no UI, gets configured. Values are stored in your own
   *  storage under `__settings`. */
  interface PluginSettingsDefinition {
    fields: PluginSettingField[]
    onChange?: (values: Record<string, unknown>) => void
  }

  /** UI you describe and Jnana draws. Used by block panels and fences, so the
   *  same code works in the sandbox and on the main thread. Text only. */
  type PluginBlock =
    | { type: 'heading'; text: string }
    | { type: 'text'; text: string }
    | { type: 'list'; items: string[]; ordered?: boolean }
    | { type: 'table'; headers?: string[]; rows: string[][] }
    | { type: 'button'; label: string; actionId: string }
    | { type: 'divider' }

  /** A right-rail panel you render yourself. Main-thread runtime only. */
  interface PluginRailPanel {
    id: string
    title: string
    Component: () => unknown
  }

  /** A right-rail panel described as blocks. Registering the same id again
   *  replaces its contents — that is how you update it. Both runtimes. */
  interface PluginBlockPanel {
    id: string
    title: string
    blocks: PluginBlock[]
    /** A `button` block was pressed. */
    onAction?: (actionId: string) => void
  }

  /** A theme you contribute. It shows up in Settings → Appearance next to the
   *  built-in presets; the user picks it, a plugin never applies it. Tokens are
   *  **validated** — colours must be six-digit hex (`#7c6af7`; Jnana derives hover,
   *  soft and label colours from them by channel arithmetic, which needs that
   *  form), lengths `12px`, durations `200ms`, easings a keyword or
   *  `cubic-bezier()` — and anything else is dropped, so a theme cannot carry
   *  `url()` or arbitrary CSS.
   *  Leave tokens out and they come from the matching built-in preset. */
  interface PluginTheme {
    id: string
    name: string
    base: 'dark' | 'light'
    tokens: {
      '--bg'?: string
      '--surface'?: string
      '--surface-2'?: string
      '--surface-3'?: string
      '--border'?: string
      '--border-hover'?: string
      '--accent'?: string
      '--text-1'?: string
      '--text-2'?: string
      '--text-3'?: string
      '--danger'?: string
      '--success'?: string
      '--warning'?: string
      '--star'?: string
      '--radius-sm'?: string
      '--radius-md'?: string
      '--radius-lg'?: string
      '--motion-scale'?: string
      '--motion-duration-fast'?: string
      '--motion-duration-base'?: string
      '--motion-duration-slow'?: string
      '--motion-ease'?: string
    }
  }

  /** A backdrop behind the app, drawn by Jnana from your parameters. Omit
   *  `colors` to follow the active theme — then it re-themes for free.
   *
   *  A user's own wallpaper (Settings → Appearance) takes precedence: if one is
   *  set, yours waits until they remove it. */
  interface PluginBackground {
    kind: 'gradient' | 'aurora' | 'image'
    /** 2–4 CSS colours (hex or rgb()/hsl()). Gradient and aurora only. */
    colors?: string[]
    /** Degrees, 0–360 (default 135). Gradient only. */
    angle?: number
    /** Seconds per drift cycle, 4–240 (default 40). Gradient and aurora only. */
    speed?: number
    /** 0–1 (default 1). */
    opacity?: number
    /** `image` only — a path inside **your own plugin folder**, e.g. `bg/dusk.jpg`
     *  (png, jpg, webp, avif, gif; 8 MB max). There is no URL form: a remote
     *  image would be an outbound request on every paint, and the WebView's CSP
     *  blocks it. Ship the file in your package. */
    file?: string
    /** `image` only: how it fills the window (default `cover`). */
    fit?: 'cover' | 'contain' | 'tile'
    /** `image` only: 0–1 blend toward the theme's background. Defaults to 0.4,
     *  because text over an undimmed photo is a contrast problem. */
    dim?: number
    /** `image` only: blur radius in px, 0–40. */
    blur?: number
  }

  /** A fenced code language you render, e.g. `lang: 'weather'` for ```weather.
   *  Return blocks; if you throw, time out (3s) or return nothing, the plain code
   *  block is shown instead. Both runtimes. */
  interface PluginFence {
    lang: string
    render: (source: string) => PluginBlock[] | Promise<PluginBlock[]>
  }

  interface PluginNetResponse {
    ok: boolean
    status: number
    /** The body as text — call JSON.parse yourself. */
    body: string
  }

  /** Requires the `network` permission. Only the hosts your manifest declares in
   *  `"hosts"` can be reached; https only, 30s timeout, 5 MB response ceiling. */
  interface PluginNetApi {
    request(
      url: string,
      init?: { method?: string; headers?: Record<string, string>; body?: string },
    ): Promise<PluginNetResponse>
  }

  /**
   * App events. You cannot emit Jnana's own note/link/annotation events.
   *
   * `emit('toast:info' | 'toast:success' | 'toast:error', 'some text')` shows the
   * user a toast — for a worker plugin, which has no UI of its own, that is the
   * way to say anything at all.
   */
  interface PluginBus {
    on<T = unknown>(event: string, handler: (payload: T) => void): void
    emit<T = unknown>(event: string, payload: T): void
  }

  interface NoteViewProps {
    note: Note
  }

  interface NoteEditorProps {
    note: Note
    /** The note's raw content; you own whatever format you keep in it. */
    value: string
    onChange: (next: string) => void
  }

  /** A note type your plugin provides. Main-thread runtime only. */
  interface NoteTypeDefinition {
    /** Matched against `note.kind`. */
    id: string
    label: string
    /** Read mode. */
    View: (props: NoteViewProps) => unknown
    /** Edit mode. */
    Editor: (props: NoteEditorProps) => unknown
    /** Plain text for search and AI indexing — without this a JSON-content note
     *  indexes as raw JSON. */
    toSearchText?: (note: Note) => string
    /** Markdown for export. */
    toExportMarkdown?: (note: Note) => string
    /** Starting content for a new note of this type. */
    newContent?: () => string
    /** Text carrying this note's `[[wikilinks]]`, for the graph and backlinks.
     *  Omit when your format has none — raw content is never scanned. */
    toLinkText?: (note: { content: string }, titleOf: (id: string) => string | undefined) => string
    /** Rewrite `[[from]]` to `[[to]]` when a linked note is renamed. */
    renameLinks?: (content: string, from: string, to: string) => string
  }

  /** A panel in the plugin widget tray. Main-thread runtime only. */
  interface PluginWidget {
    id: string
    title: string
    Component: () => unknown
  }

  /** An entry in the command palette. Works on both runtimes. */
  interface PluginCommand {
    id: string
    label: string
    /** Emoji or short glyph shown in the palette. */
    icon?: string
    hint?: string
    /** A suggested shortcut, e.g. `mod+shift+k` (`mod` = Ctrl/⌘). The user can
     *  rebind or clear it in Settings → Plugins; Jnana's own bindings win. */
    hotkey?: string
    run: () => void
  }

  interface PluginUiApi {
    /** Main-thread runtime only — throws in a worker plugin. */
    registerWidget(widget: PluginWidget): void
    registerCommand(command: PluginCommand): void
    /** Both runtimes. */
    registerSettings(definition: PluginSettingsDefinition): void
    /** Main-thread runtime only — throws in a worker plugin. */
    registerRailPanel(panel: PluginRailPanel): void
    /** Both runtimes. */
    registerBlockPanel(panel: PluginBlockPanel): void
    /** Both runtimes. */
    registerFence(fence: PluginFence): void
    /** Both runtimes. Refused (with a Plugin Console warning) if no token parses. */
    registerTheme(theme: PluginTheme): void
    /** Both runtimes. `null` clears it. One backdrop at a time, app-wide. */
    setBackground(background: PluginBackground | null): void
  }

  /** What your `init(ctx)` receives. */
  interface PluginContext {
    /** Your own id — the scope of your storage. */
    pluginId: string
    bus: PluginBus
    storage: PluginStorage
    /** Present only with the `notes` permission. */
    notes?: PluginNotesApi
    /** Present only with the `media` permission. */
    media?: PluginMediaApi
    /** Present only with the `network` permission. */
    net?: PluginNetApi
    /** Main-thread runtime only — throws in a worker plugin. */
    registerNoteType(def: NoteTypeDefinition): void
    ui: PluginUiApi
  }

  /** What your entry module must `export default`. `id` must match your manifest. */
  interface Plugin {
    id: string
    name: string
    version: string
    init?: (ctx: PluginContext) => void | Promise<void>
    /** Called before your plugin is unloaded — your last chance to save. */
    destroy?: () => void
  }
}
