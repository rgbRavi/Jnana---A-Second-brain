# Jnana - Progress Log

## Status: Phases 1–3 complete; Workspaces + Canvas + web embeds + Theme Studio landed

Last updated: 2026-06-28

---

## What is Jnana

Jnana is a local-first desktop knowledge app for students. It supports plain notes, PDFs, local
video, audio (record + transcribe), YouTube, images, web-page embeds, and document import. Notes
connect through wikilinks and a graph view, with full-text search (MiniSearch), auto/user tags, and
favourites. **Workspaces** organize notes into named groups (notes stay global, many-to-many) — each
with a scoped Dashboard, Notes, Graph, **Canvas** (a freeform spatial board), Insights, and
Collections. A global **Ctrl/⌘-K command palette** ties navigation together. The AI layer is a local
vector store in SQLite (embeddings per note chunk) with pluggable providers (OpenAI-compatible or
local Ollama), a Thread/Day analyzer, tag/link suggestions, a quiz generator, an agent loop, and an
optional per-workspace retrieval scope. **Theme Studio** (Settings → Appearance) gives token-level
theming — presets, derived accent, base swap, radius, a WCAG contrast guardrail, export/import —
applied live to the whole app and persisted to SQLite. A plugin framework exists, but plugin
implementations and activation UI are not built yet.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Desktop framework | Tauri v2 | Rust backend with WebView frontend |
| Frontend | React 19 + TypeScript | UI and hooks |
| Backend | Rust | File system, database, protocol handler, commands |
| Database | SQLite via rusqlite | Local persistence |
| Build tool | Vite 7 | Frontend build/dev tooling |
| Package manager | npm | Project package manager |
| Video player | Plyr 3 | Local video playback |
| PDF renderer | pdfjs-dist 5 | Canvas PDF rendering |
| Document conversion/extraction | LibreOffice + Pandoc | PDF conversion and plain-text extraction |
| Graph view | react-force-graph-2d | Note graph visualization |

---

## Repository

GitHub: https://github.com/rgbRavi/Jnana---A-Second-brain

Clone and run:

```bash
git clone https://github.com/rgbRavi/Jnana---A-Second-brain.git
cd Jnana---A-Second-brain
npm install
npm run tauri dev
```

Prerequisites:
- Node.js v18+
- Rust + Cargo
- Microsoft C++ Build Tools on Windows

For document conversion:
- LibreOffice is preferred
- Pandoc is used for text extraction and as a fallback in document conversion

---

## Folder Structure

```text
Jnana---A-Second-brain/
|-- src/
|   |-- types/
|   |   `-- index.ts
|   |-- lib/
|   |   |-- eventBus.ts
|   |   |-- pluginRegistry.ts
|   |   `-- pluginWorker.ts
|   |-- core/
|   |   |-- notes.ts
|   |   |-- media.ts
|   |   `-- annotations.ts
|   |-- hooks/
|   |   |-- useNotes.ts
|   |   |-- useGraph.ts
|   |   |-- useAnnotations.ts
|   |   |-- useDocumentUpload.ts
|   |   |-- useNoteAttachments.ts
|   |   |-- usePendingMedia.ts
|   |   `-- usePdfAnnotations.ts
|   |-- ui/
|   |   |-- editor/
|   |   |   |-- NoteCreator.tsx
|   |   |   |-- NoteItem.tsx
|   |   |   `-- MarkdownLite.tsx
|   |   |-- graph/
|   |   |   `-- GraphView.tsx
|   |   |-- media/
|   |   |   |-- VideoPlayer.tsx
|   |   |   `-- PdfViewer.tsx
|   |   |-- AsyncImage.tsx
|   |   |-- AsyncYouTube.tsx
|   |   `-- NoteModal.tsx
|   |-- themes/
|   |   `-- default.css
|   |-- App.tsx
|   `-- App.css
|-- src-tauri/
|   |-- src/
|   |   |-- main.rs
|   |   |-- lib.rs
|   |   |-- commands/
|   |   |   |-- notes.rs
|   |   |   |-- media.rs
|   |   |   |-- assets.rs
|   |   |   `-- annotations.rs
|   |   `-- db/
|   |       |-- mod.rs
|   |       |-- schema.rs
|   |       `-- queries.rs
|   `-- Cargo.toml
`-- package.json
```

---

## Architecture Notes

### Import rule

```text
ui -> hooks -> core -> types
          -> lib
```

Current status:
- `ui/` does not import from `core/` directly
- UI attachment and PDF annotation flows were moved behind hooks
- `hooks/` are the main orchestration layer for UI actions

### Event bus

Cross-module communication uses `eventBus`.

Events in active use:
- `note:saved`
- `note:deleted`
- `link:created`
- `link:removed`
- `annotation:created`
- `annotation:updated`
- `annotation:deleted`
- `plugin:registered`

### Plugin system

Two plugin modes exist:
- Inline plugins via `PluginBus`
- Web Worker plugins via `postMessage`

What exists now:
- Registry
- Lifecycle wiring
- Worker event forwarding
- Blocking of core event emission from plugins

What does not exist yet:
- Real plugin implementations
- Plugin activation/deactivation UI

### State ownership

`useNotes` is created once in `App.tsx`, and note CRUD flows through that hook.

### Link sync

`syncLinksForNote` parses `[[wikilink]]` titles in the WebView, then hands them
to the Rust `sync_links` command, which resolves titles and diffs the links
table inside SQLite in one transaction:
- new outbound links are added
- stale outbound links are removed
- inbound links from other notes are preserved
- the returned added/removed ids drive `link:created` / `link:removed` events

### Media pipeline

Local media import is split into two steps:

1. Copy file into assets storage
2. Register `media_refs` after the note exists

For new unsaved notes, deferred registration is handled through hook state in `usePendingMedia`.

### Annotation pipeline

PDF highlight annotations are created through hook wrappers and stored in SQLite.

The Rust `save_annotation` command ensures a matching `media_refs` row exists before inserting the annotation, which helps older or partially-registered notes keep working.

### Asset protocol

The custom `jnana-asset://` scheme is served by Tauri and supports byte ranges for local video seeking. Responses include `Access-Control-Allow-Origin: *` for WebView compatibility.

---

## Database Schema

```sql
notes                 -- id, title, content, tags, created_at, updated_at
links                 -- from_id, to_id
media_refs            -- id, note_id, media_type, path, meta, created_at
annotations           -- id, note_id, media_id, kind, position, content, created_at
favourites            -- note_id
embeddings            -- id, note_id, chunk_index, chunk_text, vector, dim, model, created_at
conversations         -- AI chat history (v4); + project_id (v6)
ai_presets            -- reusable Styles/Skills (v5)
ai_projects           -- project instructions (v6)
ai_project_knowledge  -- a project's attached notes/files (v6)
note_progress         -- per-note reading progress 0..1 (v7)
workspaces            -- id, name, icon, color, description, created_at, updated_at (v8)
workspace_notes       -- workspace_id, note_id, pinned, added_at  (junction, v8)
collections           -- id, workspace_id, name, created_at (v8)
collection_notes      -- collection_id, note_id, added_at (junction, v8)
canvases              -- id, workspace_id, title, data (JSON-Canvas doc), created_at, updated_at (v9)
link_previews         -- url, title, description, image, favicon, site_name, fetched_at (v10)
themes                -- id, name, json (opaque theme object), is_builtin, created_at (v11)
```

Notes:
- foreign keys are enabled; child + junction rows cascade on delete (removing a note/workspace only
  drops association rows — notes themselves stay global)
- WAL mode is enabled
- schema versioning is **currently at v11** — migrations: v2 favourites, v3 embeddings, v4
  conversations, v5 ai_presets, v6 ai_projects(+knowledge, conversations.project_id), v7 note_progress,
  v8 workspaces/collections, v9 canvases, v10 link_previews, v11 themes. The migration test in
  `db/schema.rs` asserts this version + expected tables.
- `themes.json` is an opaque blob the frontend owns (like canvas `data` / conversation `messages`) —
  Rust never parses it. The active theme lives in a sentinel row (`id = '__active__'`) so it
  persists without polluting the built-in/saved themes list.
- AI settings (including the API key) live outside the DB in `ai_config.json` in the app data dir, managed by Rust

---

## Tauri Commands

### Notes

| Command | Description |
|---|---|
| `get_all_notes` | Fetch all notes ordered by `updated_at DESC` |
| `get_note` | Fetch one note by id |
| `save_note` | Upsert via `INSERT ... ON CONFLICT DO UPDATE` |
| `delete_note` | Delete note and clean up linked asset files |
| `get_links` | Fetch note ids linked to a note in either direction |
| `get_all_links` | Fetch all `(from_id, to_id)` pairs |
| `create_link` | Insert link if missing |
| `remove_link` | Remove one directed link |
| `sync_links` | Diff one note's outbound wikilinks inside SQLite; returns added/removed ids |
| `add_favourite` / `remove_favourite` / `get_favourite_note_ids` | Favourites |

### AI / RAG

| Command | Description |
|---|---|
| `get_ai_config` / `set_ai_config` | AI settings stored Rust-side; API key is write-only and redacted on read |
| `ai_request` | POST a JSON body to an endpoint path of the configured provider; Rust supplies the host and injects the key |
| `ai_chat_stream` | Stream a chat completion: forwards raw SSE/NDJSON chunks to the frontend over a Tauri Channel (live tokens) |
| `ai_chat_cancel` | Stop an in-flight `ai_chat_stream` by request id |
| `import_file` | Copy a user-picked file into assets (for AI-chat attachments); returns the stored filename |
| `list_conversations` / `get_conversation` | AI chat history (per-mode list; full conversation by id) |
| `save_conversation` / `rename_conversation` / `delete_conversation` | Upsert/rename/delete a stored conversation |
| `list_presets` / `save_preset` / `delete_preset` | AI Styles & Skills (reusable system-prompt presets) |
| `list_projects` / `save_project` / `delete_project` | AI Projects (instructions + knowledge base) |
| `list_project_knowledge` / `add_project_knowledge` / `remove_project_knowledge` | Manage a project's attached notes/files |
| `save_note_embeddings` | Replace a note's chunk embeddings atomically |
| `search_embeddings` | In-process cosine similarity over all stored chunks |
| `delete_note_embeddings` | Remove a note from the vector index |
| `get_indexed_note_ids` / `get_index_stats` | Index introspection for the UI |

### Media

| Command | Description |
|---|---|
| `import_media` | Copy a file into the assets directory and return the stored filename |
| `convert_to_pdf` | Convert documents to PDF via LibreOffice or Pandoc fallback |
| `extract_text` | Extract plain text from documents via Pandoc |
| `register_media_ref` | Insert media metadata after note save |
| `get_media_refs` | Fetch stored media paths for a note |
| `save_asset` | Save arbitrary bytes such as uploaded images |
| `get_asset` | Read asset bytes |
| `get_asset_path` | Resolve an asset to an absolute OS path |

### Annotations

| Command | Description |
|---|---|
| `save_annotation` | Save annotation and ensure media ref exists |
| `get_annotations_for_note` | Fetch all annotations for a note |
| `get_annotations_for_media` | Fetch annotations for one media item |
| `update_annotation` | Update annotation text |
| `delete_annotation` | Delete annotation |

### Workspaces & collections

| Command | Description |
|---|---|
| `list_workspaces` / `save_workspace` / `delete_workspace` | Workspace CRUD (save = upsert) |
| `list_workspace_counts` | Per-workspace note counts (manager badges) |
| `list_workspace_notes` / `add_workspace_note(s)` / `remove_workspace_note` | Membership (many-to-many) |
| `set_workspace_note_pinned` / `list_note_workspace_ids` | Per-workspace pin; a note's workspaces |
| `list_collections` / `save_collection` / `delete_collection` | Collection CRUD inside a workspace |
| `list_collection_note_ids` / `add_collection_note` / `remove_collection_note` | Collection membership |

### Canvas & web

| Command | Description |
|---|---|
| `get_or_create_workspace_canvas` | The workspace's first canvas, creating an empty one on first open |
| `list_canvases` / `get_canvas` | List a workspace's canvases / fetch one fresh by id |
| `save_canvas` | Upsert a canvas's JSON doc (data only on conflict, so renames aren't clobbered) |
| `rename_canvas` / `delete_canvas` | Rename / delete a canvas |
| `fetch_link_preview` | Fetch + cache Open-Graph/title metadata for an embedded web page (`link_previews`) |

### Themes

| Command | Description |
|---|---|
| `list_themes` | Built-in presets + saved custom themes (excludes the active-theme sentinel row) |
| `save_theme` / `delete_theme` | Upsert / delete a theme row (`json` is opaque to Rust) |
| `get_active_theme` / `set_active_theme` | Read/write the currently-active theme (sentinel row) |

---

## What's Working

### Foundation
- [x] App window opens on Windows
- [x] React to Tauri bridge works
- [x] Notes create, edit, and delete
- [x] SQLite persistence works across restarts
- [x] UI no longer imports `core/` directly

### Notes
- [x] Optimistic note updates
- [x] Wikilinks create graph edges on save
- [x] Diff-based wikilink syncing
- [x] Full-screen note modal
- [x] Inline editing on note cards
- [x] Image upload and embed

### Workspaces, Canvas & web embeds
- [x] **Workspaces** — named groups; notes stay global, many-to-many membership (remove ≠ delete)
- [x] Workspace page tabs: **Dashboard** (scoped stat tiles + pinned/recent/continue/imports),
      **Notes** (reuses the full filter/sort/view-mode toolbar, keyed prefs), **Graph** (scoped to
      the workspace's notes + their internal links, own layout/viewport), **Canvas**, **Insights**
      (orphans / untagged / needs-indexing / suggested links)
- [x] **Collections** — sub-groups inside a workspace; chip-filter the Notes tab; CRUD + note picker
- [x] Templates, per-workspace icon+colour, note-count badges, pinned workspaces in the sidebar,
      quick-note capture into the active workspace, add-to-workspace from All Notes
- [x] **Command palette** (Ctrl/⌘-K) — minisearch over notes + workspaces + a command registry
- [x] **Workspace AI/search scope** — point RAG retrieval (AI view) and Search at one workspace
- [x] **Canvas** — hand-rolled pointer-event board (pan/zoom, drag/resize), text/note/media/web
      nodes, edges with optional "Link in graph" (inserts one `[[wikilink]]`), freehand ink
      (`perfect-freehand`), multiple named canvases per workspace, JSON-Canvas storage
- [x] **Web-page embeds** — `![webpage](url)` preview card (OG metadata cached Rust-side) + Live
      view iframe (YouTube rewritten to `/embed/`); `has:webpage` auto-tag, chip, and Notes filter

### Graph
- [x] Force-directed graph view
- [x] Graph simulation pauses after settling
- [x] Focus view for clicked nodes
- [x] Edit/delete from graph panel
- [x] Graph stays in sync through events
- [x] Node right-click menu — connect / disconnect-all / delete
- [x] Connect to a note via rubber-band line + click (appends `[[title]]`)
- [x] Disconnect all links (strips the `[[wikilink]]` from both sides)
- [x] Native Tauri confirm for delete (WebView `window.confirm` ignored Cancel)
- [x] Collapsible settings panel (Filters / Groups / Display / Forces)
- [x] Filters: text / date / orphans-only / tag chips, live count
- [x] Groups: user-defined color categories by `#tag` or note title
- [x] Display: arrows, hub/orphan highlight, pin, text-fade / node-size / link-thickness, Animate
- [x] Forces: center / repel / link force + distance, presets, reset
- [x] Compact jump-to-note search box

### AI Chat (dual-mode) — Phases 1–2
- [x] Mode toggle: "Focused AI Assist" (analyzer) ⇄ "AI Chat" (chatbot)
- [x] Streaming responses (live tokens) via Rust Channel + TS SSE/NDJSON parsing
- [x] Stop button cancels an in-flight stream
- [x] Multi-turn free chat; in-flight stream survives view switches (store-bound)
- [x] Native multimodal: images→vision blocks, docs→extracted text, audio→transcription
- [x] Attach Jnana notes as context, with an "include thread" (linked notes) option
- [x] Thinking toggle (reasoning models)
- [x] Deep research: own endpoint in AI settings; falls back to a system prompt if unset
- [x] Chat history + New chat persisted to SQLite (both modes; drawer + load/rename/delete)
- [x] Collapsible history sidebar; bottom-pinned composer with scrollable messages (Claude/ChatGPT-style)
- [x] AI settings remember used model names per field (datalist combobox)
- [x] Styles (response tone) + Skills (reusable instructions) — picker + manager, seeded defaults
- [x] Projects: custom instructions + knowledge base (notes/files); grounds & groups its chats

### Agentic AI — Phase A (tools over the vault)
- [x] Tool-calling in the provider (`chatWithTools`) for OpenAI-compatible + Ollama
- [x] Native tools: search / read / recent / graph_neighbors (read) + create / append / set_tags / link (staged writes)
- [x] Agent loop (`runAgent`) with step cap, write de-duplication, and live step callbacks
- [x] 🤖 Agent toggle in AI Chat — step chips + propose-then-confirm ProposalCards (Apply/Skip)
- [x] Reasoning shown per step (`AgentSteps` renders the model's narration above each tool chip)
- [x] Apply-all composes `[[wikilinks]]` into the note and saves once, so AI-applied links
      surface as graph edges (fixes a link-sync race from the old create-then-update path)
- [x] Message actions — ↻ retry under each prompt; right-click menu: edit & retry, fork from here,
      delete-from-here, delete message
- [ ] MCP client — Jnana's agent uses external MCP servers (Phase B)
- [ ] MCP server — expose Jnana to Claude Desktop / other agents (Phase C)

### View state persistence
- [x] `useViewState` hook (module-store-backed `useState`) survives view switches
- [x] Composer draft (title / body / tags / favourite) kept across views
- [x] Search query kept (results recompute from it)
- [x] AI chat thread + scope + composer kept
- [x] Graph settings panel (filters / groups / display / forces) kept

### App-wide UX layer
- [x] Toasts (`lib/toast` + `<Toaster />`) replace all blocking native `alert()` calls
- [x] In-app dialogs (`lib/dialog` + `<DialogHost />`): choice / prompt / confirm — replace every
      native `window.prompt` / `window.confirm` (doc-import, YouTube embed, open-note, highlight edit)
- [x] Keyboard `:focus-visible` rings app-wide, themed `::selection`, `prefers-reduced-motion`
- [x] Fixed views that rendered unstyled (Search / Graph / section headings referenced undefined
      global CSS classes); global `color-scheme: dark` + tokenized scrollbars

### Video
- [x] Import local video files
- [x] Serve video through `jnana-asset://`
- [x] Plyr playback with speed/fullscreen controls
- [x] Lazy loading
- [x] Timestamp links seek the first video
- [x] Indexed timestamps like `[V1::MM:SS]`

### YouTube
- [x] Embed with `![youtube](url)`
- [x] Privacy-enhanced `youtube-nocookie.com`
- [x] Offline placeholder state

### PDF
- [x] Import and embed PDFs
- [x] Multi-page controls
- [x] Zoom in/out and fit-width
- [x] Drag highlight selection
- [x] Annotation persistence in SQLite
- [x] Edit annotation note text
- [x] Page jump markers like `[D1::Page 4]`

### Documents
- [x] Import PDF directly
- [x] Convert doc/docx/odt to PDF
- [x] Extract plain text from documents
- [x] Copy external documents into assets and open via system app
- [x] Imported files persist even if the original file moves

### Appearance (Theme Studio)
- [x] **Settings → Appearance** — Presets / Design / Motion / Advanced tabs; tokens apply straight
      to `document.documentElement`, so the whole running app is the live preview (no separate
      preview pane, no React re-render for the repaint)
- [x] 5 built-in presets (Midnight, Paper, OLED, High Contrast, Reading) + a save/load/delete
      library of custom themes; export-to-clipboard / paste-to-import JSON round-trip
- [x] Derived accent (hover/active/soft/softer via sRGB `mix`), dark⇄light base swap (keeps
      accent/radius/motion), corner-radius slider, WCAG contrast guardrail (5 critical pairs,
      AA/AAA/AA Large/Fail)
- [x] Persisted to SQLite (`themes`, migrate_v11) with a localStorage mirror applied synchronously
      in `main.tsx` before first paint (no flash of default); `theme:changed` event re-themes the
      graph's accent-derived node colors live
- [ ] Density / motion / reading-scale tokens are written but not yet consumed by any CSS (controls
      ship ahead of the wiring pass) — no font picker yet either (fonts stay DM Sans / DM Mono)

### Plugin framework
- [x] Plugin registry
- [x] Inline plugin bus
- [x] Worker plugin isolation
- [x] `plugin:registered` event
- [ ] Plugin implementations
- [ ] Plugin management UI

### Verification
- [x] Unit tests exist for `eventBus`
- [ ] Build/typecheck not re-verified in this log update
- [ ] End-to-end test coverage not present

---

## What's Not Done Yet

### Phase 2 remaining
- [x] In-memory full-text search (MiniSearch)
- [x] Audio player and audio rendering (`![audio]` + `[A0::HH:MM:SS]` timestamps)
- [x] Voice recording from the mic (`VoiceRecorder`; Save blocked while recording)
- [x] Voice transcription (record → text; cloud OpenAI or local Whisper server; background jobs)
- [x] Markdown file mirror/export (per-note + bulk, with copied assets)
- [ ] Video timestamp writing from the player UI
- [ ] ffmpeg sidecar for HEVC/H.265 transcoding

### Phase 3 (AI) — started
- [x] Local RAG foundation: chunking, embeddings in SQLite, semantic retrieval
- [x] Provider abstraction: OpenAI-compatible (cloud) + Ollama (local)
- [x] Thread/Day analyzer (topic and time-window modes)
- [x] AI tag suggestions
- [x] AI link suggestions
- [x] Quiz generator
- [ ] Flashcard plugin
- [ ] Pomodoro plugin

---

## Phase Plan

### Phase 1 - Foundation (nearly complete)
- [x] Plain text note CRUD
- [x] SQLite persistence
- [x] Wikilink graph
- [x] Graph visualization
- [x] Video import and playback
- [x] YouTube embeds
- [x] Image embeds
- [x] PDF annotations
- [x] Document import and conversion
- [x] Annotation persistence
- [x] Plugin framework
- [x] UI-to-core boundary restored through hooks
- [x] Theme switcher UI — Theme Studio (Settings → Appearance), see above

### Phase 2 - Media (in progress)
- [x] PDF viewer with annotations
- [x] Document conversion and import
- [x] In-memory search (MiniSearch)
- [x] Audio player + `[A0::…]` timestamps
- [x] Voice recording from the mic
- [x] Voice transcription (cloud OpenAI or local Whisper server; background jobs + sidebar tray)
- [x] Markdown mirror/export (per-note + bulk, assets copied)
- [ ] Player-assisted timestamp writing
- [ ] HEVC transcoding support

### Phase 3 - AI (complete)
- [x] RAG foundation over local notes (user-supplied key or local Ollama)
- [x] Thread/Day analyzer (+ unified scope chat: topic/time/note)
- [x] Tag suggestions
- [x] Link suggestions
- [x] Quiz generator
- [x] Index staleness detection
