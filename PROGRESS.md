# Jnana - Progress Log

## Status: Phase 1 mostly complete, Phase 2 started

Last updated: 2026-04-20

---

## What is Jnana

Jnana is a local-first desktop knowledge app for students. It currently supports plain notes, PDFs, local videos, YouTube embeds, images, and document import in one workspace. Notes connect through wikilinks and a graph view. A plugin framework exists, but plugin implementations and activation UI are not built yet.

Audio support, theme switching, search, and AI features are still pending.

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

`syncLinksForNote` is diff-based:
- outbound links are recomputed from note content
- new links are added
- stale outbound links are removed
- inbound links from other notes are preserved

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
```

Notes:
- foreign keys are enabled
- child rows cascade on delete
- WAL mode is enabled
- schema versioning exists and is currently at v1

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
- [ ] Audio player and audio rendering
- [ ] Video timestamp writing from the player UI
- [ ] Markdown file mirror/export
- [ ] ffmpeg sidecar for HEVC/H.265 transcoding
- [ ] In-memory full-text search

### Phase 3
- [ ] AI plugin / RAG chatbot
- [ ] Auto link suggester
- [ ] Note summarizer
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

### Phase 2 - Media (early)
- [x] PDF viewer with annotations
- [x] Document conversion and import
- [ ] Audio player with markers
- [ ] Player-assisted timestamp writing
- [ ] Markdown mirror/export
- [ ] HEVC transcoding support
- [ ] In-memory search

### Phase 3 - AI
- [ ] RAG chatbot over local notes
- [ ] Auto link suggestions
- [ ] Note summaries
- [ ] AI as a user-supplied-key plugin
