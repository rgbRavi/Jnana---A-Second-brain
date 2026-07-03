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
- **Real markdown rendering** (GFM: headings, bold/italic, lists, blockquotes, code, tables,
  strikethrough, task lists) alongside the app's own embed/wikilink/timestamp tokens
- **Live editor** (Obsidian/Typora-style) — syntax markers hidden while you type; bold appears
  bold, headings are styled, media embeds render inline; raw markdown revealed near the cursor for
  quick edits; used in all three composers (new note, card edit, note modal)
- A **formatting toolbar** and **right-click context menu** in the editor — bold/italic/headings/
  lists/quote/code-block/link from the toolbar; formatting, cut/copy/paste/paste-as-plain-text, and
  import-at-cursor from the right-click menu
- **Full-screen note view** — expand the note modal to fill the content area (⤢/⤡ toggle);
  editing in fullscreen works the same way
- **Wikilinks** (`[[Title]]`) that become graph edges, kept in sync efficiently on the Rust side
- **Full-text search** (MiniSearch) across titles, tags, and content, with sensible boosting
- **Tags** — your own tags plus automatic ones (`has:image`, `has:pdf`, `long-form`, …)
- **Favourites** for quick access

### Knowledge graph
- Interactive force-directed graph of your notes and their links
- Focus a node to see just its neighbourhood; search and jump to any node
- **Connect mode** — link two notes by clicking them (adds a durable `[[wikilink]]` to the source)
- Edit or delete a note straight from the graph panel

### Workspaces
- **Named groups** that organize notes without separate vaults — a note can live in many workspaces,
  and removing it from one only drops the association (it stays in All Notes)
- Each workspace has its own **Dashboard** (scoped stats + pinned/recent/continue/imports),
  **Notes** (the full filter/sort/view-mode toolbar), a **scoped Graph** (just this workspace's
  notes + the links between them), **Canvas**, and **Insights** (orphans, untagged, needs-indexing,
  suggested links)
- **Collections** — lightweight sub-groups inside a workspace that chip-filter its notes
- Templates (Research / Course / Writing / …), per-workspace icon & colour, note-count badges,
  pinned workspaces in the sidebar, and quick-note capture straight into the active workspace

### Canvas (freeform board)
- A pannable / zoomable **spatial board per workspace** — drop **note cards**, text cards,
  images/media, and **web pages**, and **draw/paint** freehand
- **Connect cards** by dragging between them; a note↔note line can be promoted to a real
  `[[wikilink]]` ("Link in graph") so it shows up in the graph and backlinks
- Multiple named canvases per workspace; stored in the portable [JSON Canvas](https://jsoncanvas.org) shape

### Command palette
- Global **Ctrl/⌘-K** to fuzzy-jump to any note, switch workspaces, or run a command

### Media
- **PDFs** — embed, page through, zoom/fit, and create persistent highlight annotations; compact
  **thumbnail preview** in note cards (click to open the full viewer)
- **Local video** — imported and streamed through a custom asset protocol (with range/seek support)
- **Audio** — import or **record from your mic**, with a clean player
- **Images** — upload + embed, with a lightbox
- **YouTube** — privacy-enhanced (`youtube-nocookie`) embeds
- **Web pages** — `![webpage](url)` embeds a link-preview card (title/description/image/favicon,
  fetched + cached on the Rust side) with a best-effort in-app **Live view**
- **Timestamps** — clickable `[V0::HH:MM:SS]` (video) and `[A0::HH:MM:SS]` (audio) markers that
  seek the matching player, indexed in document order
- **Resize & align media** — hover any embedded image, video, audio, or YouTube in the live editor
  to reveal a resize handle (drag to size) and alignment buttons (left/center/right); multiple
  narrow embeds share the same row automatically; sizes persist without touching your markdown
- **Reorder media** — ▲/▼ buttons in the hover toolbar move a media block up or down past the
  adjacent paragraph (order lives in markdown; layout metadata follows independently)

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
- **Workspace scope** — point AI chat (and Search) at the whole vault or a single workspace
- **Index staleness** — flags notes edited since they were last indexed, with a one-click re-index

### Export
- Export a single note or **all notes** to Markdown; media references are rewritten to a relative
  `assets/` folder (copied alongside) and tables/embeds export portably (Obsidian/VS Code friendly)

### Appearance (Theme Studio)
- **Settings → Appearance** — token-level theming, not a "pick one of N themes" dropdown: tune
  individual CSS custom properties (`--accent`, `--surface*`, `--text*`, `--radius-*`, motion) and
  the whole running app repaints live, with **no React re-render** for the repaint itself
- **5 built-in presets** (Midnight, Paper, OLED, High Contrast, Reading) plus a library of your own
  saved custom themes — export/import as JSON, swap dark ⇄ light while keeping your accent/radius
- **Derived accent** (hover/active/soft/softer), a corner-radius slider, and a live **WCAG contrast
  guardrail** (AA/AAA/AA Large/Fail) over the 5 critical text/surface pairs
- Persisted to SQLite (with a localStorage mirror so the right theme applies before first paint —
  no flash of default); density/motion/reading-scale controls are wired but not yet consumed by any
  CSS, ahead of a follow-up pass

---

## Planned

See [PLAN.md](PLAN.md) for the live roadmap. Highlights:

- **Tables** — a CSV-backed `table` block with a grid editor and paste-from-spreadsheet support,
  exported to GFM pipe tables ([full spec](TABLES.md)); composes with the GFM pipe tables the
  renderer already supports
- **Code syntax highlighting** — fenced code blocks render as plain styled monospace today; a
  highlighter seam (`core/markdown/highlight.ts`) is ready for a lazy-loaded highlighter later
- **Polish pass** — a shared modal component, and wiring Theme Studio's density/motion/reading-scale
  tokens into real CSS (design tokens, in-app dialogs, the graph enhancements, Theme Studio, and the
  markdown renderer rewrite have already landed)
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
  ui/        components (editor, media, graph, ai, CommandPalette, WebEmbed)
  views/     routed pages (home, notes, search, graph, ai, settings, workspaces/[+canvas])

src-tauri/
  src/commands/  Tauri commands (notes, media, assets, annotations, ai, embeddings, export,
                 workspaces, canvas, web)
  src/db/        SQLite init, schema/migrations, queries

whisper-server/  optional local transcription server (FastAPI + faster-whisper, Docker)
```

## Architecture notes
- Strict layering: `ui → hooks → core → Rust commands → SQLite/assets`; UI never imports `core` directly.
- Cross-module sync runs through an event bus (`note:saved`, `link:created`, `annotation:*`, …).
- Wikilink syncing is a single Rust command (`sync_links`) that diffs inside SQLite.
- Notes render through `react-markdown` + `remark-gfm` + a custom plugin
  (`core/markdown/remarkJnana.ts`) that turns `[[wikilinks]]` and `[V0::…]`/`[A0::…]` timestamps into
  custom AST nodes (and assigns document-order indices to `![video]`/`![audio]` embeds) without
  touching code fences; a `components` map renders those nodes into the existing embed components.
- Theming applies CSS-var overrides straight to `document.documentElement` (`core/themes/apply.ts` →
  `hooks/useTheme.ts`), persisted to SQLite (`themes` table) with a localStorage mirror for a
  flash-free boot; `theme:changed` lets the graph re-theme its accent-derived node colors.
- Local assets are served via a custom `jnana-asset://` protocol; filenames are validated to
  prevent path traversal, and external opens go through a scoped `open_asset` command.
- AI settings and keys live in a Rust-side config file; provider requests are proxied through Rust
  and constrained to the configured host (chat / embedding / transcription each independent).

More detail: [PROGRESS.md](PROGRESS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [PLAN.md](PLAN.md)
