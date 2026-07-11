# Jnana Release Notes

## Version 0.1.0

### Overview
Jnana is a local-first desktop knowledge app for students and researchers, built with Tauri, React 19, TypeScript, Rust, and SQLite. It stores notes, media, and linked knowledge locally, with an optional AI layer that can run offline or through cloud-compatible providers.

### Key Highlights
- Local-first note storage with SQLite persistence and asset management.
- Real markdown rendering with GFM support and rich app-specific embeds.
- Live editor with Obsidian/Typora-style inline rendering and slash-command shortcuts.
- Interactive knowledge graph powered by `[[wikilinks]]`, including unresolved pseudo-node handling.
- Workspaces for scoped note organization, plus dashboard, graph, canvas, and insights views.
- Canvas board with note/media/text cards, spatial layout, and manual linking.
- AI features built around local grounding, embeddings, and optional remote providers.
- Theme Studio with live token-based theming and persisted custom presets.

### Features
#### Notes & Editing
- Create, edit, delete, and search notes with optimistic UI updates.
- Hybrid markdown support: headings, bold/italic, lists, blockquotes, code, tables, strikethrough, task lists.
- Live editor with formatting toolbar, context menu, and inline slash-command menu.
- `[[wikilink]]` autocomplete with live note search and create-on-demand.
- Working Notes desk with tabs, split panes, autosave, and restored layout on relaunch.
- Peek modal for quick note reading, with full-screen expansion and jump-to-edit support.

#### Media & Documents
- Embed local images, video, audio, YouTube, PDFs, and web previews.
- Persistent media layout with resize, alignment, and drag-to-arrange support in editor mode.
- PDF viewer with thumbnail previews and highlight annotations.
- Document import and conversion support for PDF and common office formats.

#### Graph & Workspaces
- Force-directed note graph with neighbourhood focus and link creation mode.
- Unresolved wikilinks rendered as faded pseudo-nodes for quick note creation.
- Workspaces that keep notes global while organizing them into scoped groups.
- Workspace-level dashboard, notes, graph, canvas, collections, and insights.
- Collection support for lightweight note filtering inside workspaces.

#### AI & Search
- Local vector store in SQLite with embeddings, semantic search, and retrieval scope.
- Optional AI provider integration with OpenAI-compatible or local Ollama endpoints.
- Grounded chat, quiz generation, tag suggestions, and link suggestions.
- Per-workspace AI scope and index staleness awareness.

#### Themes & UI
- Token-based Theme Studio for accent, surfaces, text, radius, motion, and live app repaint.
- Built-in presets plus saved custom themes persisted to SQLite.
- No flash boot experience via localStorage mirror and immediate theme apply.

#### Security & Reliability
- AI provider keys are stored Rust-side (outside the WebView and the SQLite DB) and never
  serialized back to the frontend; provider requests are proxied through Rust and pinned to the
  configured host.
- Web-page preview fetching is guarded against SSRF: requests to loopback, private, link-local,
  unique-local, CGNAT, and cloud-metadata addresses are refused, and every redirect hop is
  re-validated.
- Local assets are served through the `jnana-asset://` protocol with path-traversal validation on
  every resolve path; external opens are limited to the managed assets directory.
- Database migrations run each step in its own transaction, so an interrupted upgrade rolls back
  cleanly instead of leaving a half-applied schema.
- An app-wide error boundary keeps a single failing view from blanking the whole window, and a
  consistent-snapshot backup/restore is available in Settings → Import / Export.

### Platform & Technology
- Tauri v2 desktop shell for Windows.
- React 19 + TypeScript frontend.
- Rust backend with SQLite via `rusqlite` and custom commands.
- `react-markdown` + `remark-gfm` with a custom plugin for app-specific markdown tokens.
- `pdfjs-dist` for PDF rendering, `react-force-graph-2d` for graph visualization, `MiniSearch` for full-text search.

### Notes
- Everything is local-first; no user data is uploaded unless configured for cloud AI providers.
- AI and transcription are optional; local Whisper server and Ollama support are available.
- Current schema version is 12, with migrations supporting themes, media layout, workspace, and AI features.

---

## Known Limitations and Planned Improvements
- Tables and spreadsheet-style table editing are planned for a future release.
- Code syntax highlighting is currently a rendering seam and not fully styled.
- Theme Studio density/motion/reading-scale tokens are configured but not fully wired into CSS yet.
- Plugin activation UI and plugin implementations are not yet available.

---

## License
- Jnana is licensed under the **GNU Affero General Public License, version 3 (AGPL-3.0)** — see
  [LICENSE](LICENSE). Modifications that are distributed or served over a network must publish their
  source under the same license; commercial use is permitted.
- **Plugins** that interface only through Jnana's documented plugin API are exempt and may be
  released under any terms, including proprietary — see [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md).
- The license notice and a link to the corresponding source are shown in **Settings → About**.
