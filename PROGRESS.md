# Jnana - Progress Log

## Status: Phase 1 mostly complete, Phase 2 underway, Phase 3 (AI) started

Last updated: 2026-06-13

---

## What is Jnana

Jnana is a local-first desktop knowledge app for students. It currently supports plain notes, PDFs, local videos, YouTube embeds, images, and document import in one workspace. Notes connect through wikilinks and a graph view, with full-text search (MiniSearch), auto/user tags, and favourites. The AI layer has landed: a local vector store in SQLite (embeddings per note chunk), pluggable providers (OpenAI-compatible or local Ollama), and a Thread/Day analyzer. A plugin framework exists, but plugin implementations and activation UI are not built yet.

Audio support, theme switching, markdown export, and the remaining AI features (tag/link suggestions, quiz) are still pending.

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
notes        -- id, title, content, tags, created_at, updated_at
links        -- from_id, to_id
media_refs   -- id, note_id, media_type, path, meta
annotations  -- id, note_id, media_id, kind, position, content, created_at
favourites   -- note_id
embeddings   -- id, note_id, chunk_index, chunk_text, vector, dim, model, created_at
```

Notes:
- foreign keys are enabled
- child rows cascade on delete
- WAL mode is enabled
- schema versioning exists and is currently at v3 (v2 favourites, v3 embeddings)
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

### Phase 1 remnant
- [ ] Theme switcher UI

Current theme status:
- `src/App.css` drives the active app styling
- `src/themes/default.css` exists as a starter file
- no theme switcher is wired up
- no second active theme exists

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
- [ ] AI tag suggestions
- [ ] AI link suggestions
- [ ] Quiz generator
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
- [ ] Theme switcher UI

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
