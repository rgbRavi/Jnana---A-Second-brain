# Jnana — A Second Brain

Jnana is a **local-first desktop knowledge app** for students and researchers — a place to keep
notes, media, and the connections between them, with an **optional, privacy-respecting AI layer**
that works over *your own notes* and can run fully offline.

Built with Tauri v2, React 19, TypeScript, Rust, and SQLite. Your notes and files live on your
machine, in plain SQLite + a local assets folder — not someone else's cloud.

Repository: https://github.com/rgbRavi/Jnana---A-Second-brain

---

## Why Jnana

- **Local-first & private.** Everything is stored on your device (SQLite + an app-managed assets
  folder). It works offline. Nothing is uploaded unless *you* choose a cloud AI provider.
- **Media-native, not just text.** PDFs, local video, audio, images, and YouTube live *inside*
  your notes — with highlight annotations on PDFs and clickable timestamps on audio/video.
- **A real knowledge graph.** Notes link with `[[wikilinks]]` and render as an interactive
  force-directed graph you can explore, search, and connect by hand.
- **AI that's grounded and optional.** The AI features answer *only* from your notes, cite the
  source notes they used, and never invent facts. You bring your own key — or run everything
  locally (Ollama for chat/embeddings, a local Whisper server for transcription). Chat and
  embeddings are configured **independently**, so you can embed locally and chat in the cloud.
- **Yours to take with you.** Export any note (or all of them) to portable Markdown with assets.

---

## Features (working today)

### Notes & organization
- Note create / edit / delete with instant (optimistic) updates and SQLite persistence
- Lightweight markdown rendering with custom embeds, plus a full-screen note view and inline editing
- **Wikilinks** (`[[Title]]`) that become graph edges, kept in sync efficiently on the Rust side
- **Full-text search** (MiniSearch) across titles, tags, and content, with sensible boosting
- **Tags** — your own tags plus automatic ones (`has:image`, `has:pdf`, `long-form`, …)
- **Favourites** for quick access

### Knowledge graph
- Interactive force-directed graph of your notes and their links
- Focus a node to see just its neighbourhood; search and jump to any node
- **Connect mode** — link two notes by clicking them (adds a durable `[[wikilink]]` to the source)
- Edit or delete a note straight from the graph panel

### Media
- **PDFs** — embed, page through, zoom/fit, and create persistent highlight annotations
- **Local video** — imported and streamed through a custom asset protocol (with range/seek support)
- **Audio** — import or **record from your mic**, with a clean player
- **Images** — upload + embed, with a lightbox
- **YouTube** — privacy-enhanced (`youtube-nocookie`) embeds
- **Timestamps** — clickable `[V0::HH:MM:SS]` (video), `[A0::HH:MM:SS]` (audio), and `[D1::Page n]`
  (PDF) markers that jump the player/page

### Documents
- Import PDFs directly, convert `doc`/`docx`/`odt` → PDF (LibreOffice/Pandoc), or extract text
- External documents are copied into app storage so links keep working if the original moves

### Voice transcription
- Transcribe any audio clip to searchable, AI-analyzable text — **in the background**, with a
  progress tray in the sidebar
- Choose **cloud** (OpenAI Whisper) or a **local Whisper server** (OpenAI-compatible, e.g.
  faster-whisper — a ready-to-run Docker setup is included in [`whisper-server/`](whisper-server/))

### AI layer (bring-your-own-key, or fully local)
All AI is optional, configured in **Settings → AI Providers**, and grounded strictly in your notes.
Keys are stored on the Rust side (never in browser-reachable storage) and requests are proxied
through Rust to only the host you configured.

- **Thread / Day analyzer** — synthesize what you've learned by **topic**, **time window**, or a
  **note + its linked thread**; returns a summary, key concepts, open questions, and weak spots,
  with the exact source notes cited
- **Grounded chat** — ask follow-up questions about the same scope; quick `/today`, `/week`,
  `@NoteTitle` commands to set scope
- **Quiz generator** — recall / application / compare questions from a scope, with reveal-on-click answers
- **Tag suggestions** — proposes tags (preferring your existing vocabulary), one click to apply
- **Link suggestions** — finds related notes by semantic similarity and offers a `[[wikilink]]`,
  showing the matching passage as evidence
- **Local vector store** — embeddings live in SQLite; semantic search runs in-process (no vector DB)
- **Hybrid providers** — chat and embeddings are independent: e.g. embed locally with Ollama while
  chatting through a cloud API
- **Index staleness** — flags notes edited since they were last indexed, with a one-click re-index

### Export
- Export a single note or **all notes** to Markdown; media references are rewritten to a relative
  `assets/` folder (copied alongside) and tables/embeds export portably (Obsidian/VS Code friendly)

---

## Planned

See [PLAN.md](PLAN.md) for the live roadmap. Highlights:

- **Tables** — a CSV-backed `table` block with a grid editor and paste-from-spreadsheet support,
  exported to GFM pipe tables ([full spec](TABLES.md))
- **Rich Markdown** — a hybrid remark renderer for headings/bold/lists/code/tables, keeping the
  custom embed + wikilink + timestamp tokens
- **Graph enhancements** — disconnect links, tag-based coloring/clustering, orphan & hub
  highlighting, filtering, directed edges, pinned layout
- **Polish pass** — dark/light theme toggle, a shared modal component, design tokens, and replacing
  the remaining `window.prompt` dialogs with proper UI
- **Later / measure-first** — metadata-only note loading at scale, optional sync/backup, a plugin
  permission model

---

## Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri v2 (Rust backend + WebView frontend) |
| Frontend | React 19 + TypeScript, Vite 7 |
| Backend | Rust |
| Database | SQLite via `rusqlite` (WAL, foreign keys, schema migrations) |
| Media | pdfjs-dist (PDF), Plyr / `<video>`/`<audio>`, react-force-graph-2d (graph) |
| Search | MiniSearch (in-memory full-text) |
| AI | OpenAI-compatible APIs or local Ollama (chat + embeddings); OpenAI/local Whisper (transcription) |
| Docs | LibreOffice + Pandoc (conversion / text extraction) |

---

## Getting started

### Prerequisites
- Node.js 18+
- Rust + Cargo
- Microsoft C++ Build Tools (on Windows)

Optional, per feature:
- **LibreOffice** / **Pandoc** — document conversion & text extraction
- **Ollama** — local chat and/or embedding models (fully offline AI)
- A **local Whisper server** — offline transcription (see [`whisper-server/`](whisper-server/))

### Run
```bash
git clone https://github.com/rgbRavi/Jnana---A-Second-brain.git
cd Jnana---A-Second-brain
npm install
npm run tauri dev
```

### Other commands
```bash
npm run build    # tsc + vite build
npm test         # frontend unit tests (Vitest)
# Rust:
cd src-tauri && cargo build && cargo test
```

---

## Project structure

```text
src/
  core/      app services that call Rust commands (notes, media, ai, export, …)
  hooks/     UI orchestration (useNotes, useGraph, useRag, useComposer, …)
  context/   React contexts (Notes, Transcription)
  lib/       event bus + plugin scaffolding
  types/     shared frontend types
  ui/        components (editor, media, graph, ai)
  views/     routed pages (home, notes, search, graph, ai, settings)

src-tauri/
  src/commands/  Tauri commands (notes, media, assets, annotations, ai, embeddings, export)
  src/db/        SQLite init, schema/migrations, queries

whisper-server/  optional local transcription server (FastAPI + faster-whisper, Docker)
```

## Architecture notes
- Strict layering: `ui → hooks → core → Rust commands → SQLite/assets`; UI never imports `core` directly.
- Cross-module sync runs through an event bus (`note:saved`, `link:created`, `annotation:*`, …).
- Wikilink syncing is a single Rust command (`sync_links`) that diffs inside SQLite.
- Local assets are served via a custom `jnana-asset://` protocol; filenames are validated to
  prevent path traversal, and external opens go through a scoped `open_asset` command.
- AI settings and keys live in a Rust-side config file; provider requests are proxied through Rust
  and constrained to the configured host (chat / embedding / transcription each independent).

More detail: [PROGRESS.md](PROGRESS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [PLAN.md](PLAN.md)
