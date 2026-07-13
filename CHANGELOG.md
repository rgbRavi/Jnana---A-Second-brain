# Changelog

All notable changes to Jnana are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Workspaces remember their active tab.** The Dashboard/Notes/Graph/Canvas/Insights selection is now
  stored **per workspace** in localStorage (was a single in-memory key shared across all workspaces), so
  returning to a workspace lands where you left off instead of resetting to Dashboard.
- **AI tag / link suggestions redesigned.** The two are now compact icon buttons on one line (label
  revealed on hover); clicking either runs the suggestion and opens a checkbox dropdown of the results
  with **Select all** + an **Apply** button, so you pick which tags/links to apply in one go rather than
  clicking chips one at a time.
- Bundle identity finalized for packaging: `productName` is now `Jnana` (was the scaffold default
  `Jnana---A-Second-brain`) and the Rust crate carries a real `description`.

### Security
- Narrowed the `jnana-asset://` CORS policy from a blanket `Access-Control-Allow-Origin: *` to reflect
  only the app's own WebView origins (deny others with `null`); media and pdf.js are unaffected.

### Added
- **Draw & type on PDFs.** The PDF viewer gained a markup toolbar (next to the zoom controls) and an
  intuitive right-click menu with four tools: **Pen** (freehand ink with a colour + size, reusing the
  canvas board's `perfect-freehand` renderer), **Text** (free-positioned text boxes — click, the ＋ Text
  button, or right-click "Add text box here" — dragged to reposition, double-click to edit), **Eraser**
  (removes ink strokes), and the existing **Highlight**. Marks are stored as overlay annotations
  (`pdf_ink` / `pdf_text`, alongside `pdf_highlight`) in PDF-coordinate space, so they stay anchored
  across zoom and page changes; the `.pdf` bytes are never modified.
- **Readable PDF text on any page.** Typed text auto-picks a colour that contrasts the page background
  (sampled from the rendered page under the box), with a right-click **Text colour** override (or "Auto
  (contrast)" to revert).
- **Inline highlight notes.** Clicking a highlight now opens a small note editor **anchored over the
  highlight inside the viewer** (Enter/blur saves, Escape cancels) instead of a centred prompt dialog.
- **Resizable / draggable PDF embeds** in the live editor — a PDF embed now carries the same
  resize handle, drag grip, alignment, and move ▲/▼ chrome as image/video embeds (saved to
  `note_media_layout`); read-mode honours the saved width.
- **Text colour & highlight in the note composers.** Toolbar swatch dropdowns (plus "Text colour" /
  "Highlight" right-click submenus and `/`-menu rows) wrap the selection in a `[c:NAME]…[/c]` (coloured
  text) or `[h:NAME]…[/h]` (translucent highlight) token, rendered in both read- and edit-mode. Each
  dropdown offers the curated palette **and a custom-colour picker**; the two tokens **nest** (a
  highlight inside a text colour, or vice-versa) and render as nested spans. Values are sanitised
  (palette name, `#hex`, or a bare CSS colour word only).
- **"← Back" button in Working Notes.** Opening a note for editing from a workspace (or search/home)
  remembers the origin; a back button in the Notes header returns you there in one click instead of
  re-navigating manually.
- **"Open workspaces" in the sidebar.** Visiting a workspace adds it to the sidebar's workspaces
  sub-tree (pinned + open, under a single disclosure chevron on the **Workspaces** nav item); each open
  row has a hover **×** to dismiss it. Closing (the sidebar × or the in-view **✕ Close** button, added
  alongside the existing "← Workspaces" return link) also returns to the all-workspaces view when you're
  currently on that workspace.
- Automatic DB snapshot into `backups/` before any version-bumping migration runs.
- Modal dialogs now trap Tab/Shift+Tab focus and return focus to the previously-focused element on close.
- Markdown export writes YAML frontmatter (title, timestamps, tags, id) so tags/metadata survive.

### Fixed
- **PDF preview/open failed under `tauri dev`.** The narrowed `jnana-asset://` CORS check only accepted
  origins whose host was exactly `localhost`/`*.localhost`, but the dev server's origin carries a port
  (`http://localhost:1420`), so pdf.js's `fetch` for the bytes was denied (`Access-Control-Allow-Origin:
  null`) and PDFs showed "Couldn't preview this PDF". The origin check now strips the port. `<img>`/
  `<video>` were unaffected (they send no `Origin`), and packaged builds were unaffected (no port).
- **PDF thumbnail reloaded on every keystroke.** The first-page render (pdf.js fetch + paint) re-ran
  whenever its editor widget remounted, flashing "Loading…". The rendered page is now cached (data URL,
  keyed by filename) so remounts paint instantly.
- **Right-click menu appeared behind the fullscreen PDF.** The shared context menu (`z-index: 1200`)
  rendered under the fullscreen viewer overlay (`z-index: 9999`); the menu now sits above modal overlays.
- **Editor popups in the docked composer.** The right-click context menu, `/` command menu, and `[[`
  note-picker did not appear when composing a **fresh** note — the dock's CSS `transform` made it the
  containing block for their `position: fixed`, positioning them off-screen. They now render through a
  `document.body` portal, so they anchor to the viewport in every composer. The toolbar colour picker
  also opens **upward** (it sits in the footer at the window's bottom edge) and its custom-colour input
  is styled directly (the previous transparent overlay didn't forward clicks in the webview).
- **Fresh-install database initialization.** A brand-new install failed to create its database because
  the first migration set `PRAGMA journal_mode=WAL` inside a transaction (which SQLite rejects on a
  file database); WAL is now enabled on the connection before migrations run. Existing databases were
  unaffected.
- **Recoverable database-failure startup.** A failed migration or corrupt database no longer hard-crashes
  the app with a raw panic; startup now surfaces a native error dialog that points at the data folder
  (notes + backups) and logs, then exits cleanly.
- Serving a 0-byte asset with a `Range` request no longer underflows the byte-range math (which could
  attempt a ~`u64::MAX` allocation) — empty files fall through to a normal full response.
- `convert_to_pdf` no longer panics on paths with no file name or non-UTF-8 characters; document paths
  are passed to the converter as OS strings instead of unwrapped `&str`.
- `import_media` now sanitizes the source file extension before using it in the stored filename,
  matching `save_asset`/`import_file`.

## [0.1.0] — 2026-07-11

Initial release. See [RELEASE_NOTES.md](RELEASE_NOTES.md) for the full feature list. Highlights:

### Added
- Local-first note storage (SQLite via `rusqlite`) with asset management and consistent-snapshot
  backup/restore.
- Real markdown rendering (`react-markdown` + `remark-gfm`) with app-specific embeds, plus a CodeMirror 6
  live editor with inline rendering, a formatting toolbar, slash commands, and `[[wikilink]]` autocomplete.
- Working Notes desk with tabs, split panes, autosave, and layout restored on relaunch.
- Interactive `[[wikilink]]` knowledge graph, including faded pseudo-nodes for unresolved links.
- Workspaces (notes stay global; membership is many-to-many) with per-workspace dashboard, notes, graph,
  canvas, collections, and insights.
- Freeform canvas board with note/media/text/web cards and manual graph-linking.
- Local media/document embeds (images, video, audio, YouTube, PDF, web previews) with persistent
  resize/alignment/drag layout, and a PDF viewer with highlight annotations.
- Optional AI layer: local SQLite vector store with semantic search, grounded chat, quiz/tag/link
  suggestions, and per-workspace scope; OpenAI-compatible or Ollama providers with keys held Rust-side.
- Theme Studio: token-based live theming with built-in presets and persisted custom themes.

### Security
- AI provider keys stored Rust-side (outside the WebView and the DB) and never serialized back to the
  frontend; all provider HTTP proxied through Rust.
- SSRF guard on web-preview fetching (loopback/private/link-local/CGNAT/metadata refused; every redirect
  hop re-validated).
- `jnana-asset://` serving with path-traversal validation; external opens limited to the managed assets
  directory.
- Transactional migrations — each step runs in its own transaction so an interrupted upgrade rolls back
  cleanly.

[Unreleased]: https://github.com/rgbRavi/Jnana---A-Second-brain/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rgbRavi/Jnana---A-Second-brain/releases/tag/v0.1.0
