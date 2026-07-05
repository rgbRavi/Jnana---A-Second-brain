# Jnana — Forward Plan

Last reorganized: 2026-06-13 (Theme Studio shipped 2026-06-28; hybrid markdown renderer +
format toolbar shipped 2026-06-28 — see Phase C; live editor + media layout + context menu +
NoteModal fullscreen + performance improvements shipped 2026-07-03 — see Phase C)

## Working philosophy

Build **breadth-first to "functional," then polish as a batch** — not feature-by-feature to a
shine, and not "all core then all UI." Concretely:

- Get every remaining core capability working end-to-end with thin, unstyled UI before doing a
  dedicated polish pass. This keeps the app dogfoodable, surfaces hard problems early, and lets
  polish be decided once (shared components, design tokens) instead of re-derived per feature.
- **Exception:** when a UI decision is load-bearing for the feature's design (as the AI
  analyzer's scope/chat model was), co-build the UI — you can't design that on paper.
- Keep hardening and tests **inline**, never as a separate phase.

---

## Phase A — Foundation & hardening ✅ DONE

- [x] Note CRUD, wikilinks, graph, full-text search, tags, favourites, PDF/video/image/doc media.
- [x] AI/RAG layer: provider abstraction (OpenAI-compatible + Ollama), chunking, SQLite vector
      store, semantic retrieval.
- [x] Hardening sprint (P0+P1): asset-path traversal guard, Rust-side AI config/key + scoped
      `ai_request`, `sync_links` in SQLite, search-index fix, scoped `open_asset` + dropped
      blanket opener grant, graph tooltip escaping, annotation de-dup, cleartext-key block,
      CSP `script-src` tightened, first Rust + TS tests.

---

## Phase B — Complete core capabilities (breadth-first, functional UI) ← CURRENT

Goal: every remaining core feature exists and is usable end-to-end. Thin UI; defer styling.

1. **Audio player** ✅ DONE — audio MIME types in `mime_from_ext`, `AsyncAudio`, `![audio]`
   embed + `[A0::HH:MM:SS]` timestamps in `MarkdownLite`, upload via toolbar 🎵 button.
2. **Voice recording (mic)** ✅ DONE — `VoiceRecorder` (getUserMedia + MediaRecorder, graceful
   permission denial) → `uploadAsset` → `![audio]` embed. Recording state is lifted to the
   composer so Save is disabled (greyed + "Finish recording before save") while recording.
   Verified: mic permission prompt works on Windows/WebView2.
3. **Voice transcription** ← CURRENT (bigger). record → text so memos become full-text
   searchable *and* AI-analyzable, with `[A0::…]` synced back to the audio. Engine decision
   pending (see below). Plan: a Rust transcription command, a "Transcribe" action on an audio
   embed, store the transcript with the note (so search + the analyzer pick it up).
   - **Note:** the existing `ai_request` proxy is JSON-only; transcription needs its own path
     (multipart upload for cloud, or a sidecar/native call for local). OpenRouter has no
     transcription endpoint, so the current OpenRouter key can't be reused for cloud STT.
4. **Markdown export** ✅ DONE — export one note (NoteModal ⤓) or all (Notes view "Export all")
   to a chosen folder as `.md`; media refs rewritten to relative `assets/` paths with the asset
   files copied alongside (portable to Obsidian/VS Code). Rust `export_notes` command +
   `core/export.ts`.
5. **AI tag suggestions** ✅ DONE — "✨ Suggest tags" in NoteModal: grounded in the note + the
   user's tag vocabulary, existing tags shown before proposed-new ones, reason on hover, one
   click to apply. Never auto-mutates (`core/ai/suggestTags.ts` + `TagSuggestions`).
6. **AI link suggestions** ✅ DONE — "🔗 Suggest links" in NoteModal: retrieval over the vector
   store finds related notes (excludes self + already-linked), shows the matching passage as
   evidence, one click appends a `[[wikilink]]`. Pure retrieval, no LLM (`core/ai/suggestLinks.ts`
   + `LinkSuggestions`).
7. **Quiz generator** ✅ DONE — a "Quiz" mode in the analyzer: generates recall/application/
   compare questions over the current scope, each revealing answer + explanation on click
   (`core/ai/quiz.ts`, `QuizCard` in `AiChat`).
8. **AI index staleness** ✅ DONE — `get_index_times` (Rust) compared to note `updated_at`;
   the settings modal shows "N need (re)indexing" with an "Index N updated" button.

**Phase B complete.**

---

## Phase C — Polish & consistency pass (after Phase B's feature set is stable)

- [ ] Extract a shared `<Modal>` component (NoteModal + the MarkdownLite lightbox / PDF
      fullscreen duplicate the overlay/container pattern; the old AI-settings modal classes in
      `Ai.module.css` are now dead and can go).
- [x] Establish design tokens / a small component layer — tokens live in `main.css`; first shared
      components landed: `<Toaster />` (`lib/toast`) and `<DialogHost />` (`lib/dialog`, a
      promise-based choice/prompt/confirm). Also: app-wide `:focus-visible` rings, themed
      `::selection`, `prefers-reduced-motion`, `color-scheme: dark`, tokenized scrollbars, and
      fixes for views that referenced undefined global CSS classes (Search / Graph / headings).
- [x] Dark/light theme toggle — shipped as **Theme Studio** (Settings → Appearance), token-level
      theming rather than a plain toggle: 5 built-in presets (incl. dark/light), a saved-themes
      library, derived accent, base dark⇄light swap, corner radius, a WCAG contrast guardrail, and
      JSON export/import. Tokens apply live to `document.documentElement` (no React re-render for
      the repaint) and persist to SQLite (`themes`, migrate_v11) with a localStorage boot mirror.
      Density/motion/reading-scale controls are wired but not yet consumed by any CSS, and there's
      no font picker yet — both are a follow-up pass, not blocking.
- [x] Replace the three `window.prompt` flows with proper modals: document-import choice
      (`useDocumentUpload.ts`), YouTube URL (`ComposerToolbar.tsx`), highlight edit
      (`PdfViewer.tsx`) — all use `showChoiceDialog` / `showPromptDialog` now; the "Open note?"
      `window.confirm` in `MarkdownLite` and every `alert()` are converted too (no native dialogs
      remain).
- [ ] CSP runtime check: confirm the `script-src 'self'` tightening holds in `tauri dev`;
      revisit `style-src 'unsafe-inline'` (needs nonces) only if worth it.
- [x] **Hybrid markdown AST renderer (remark)** ✅ DONE — `MarkdownLite` rewritten on
      `react-markdown` + `remark-gfm` (headings/bold/lists/blockquotes/code/**tables**/
      strikethrough/task-lists), with a custom plugin
      ([core/markdown/remarkJnana.ts](src/core/markdown/remarkJnana.ts)) preserving the app's
      tokens: `[[wikilink]]` and `[V/A::HH:MM:SS]`/`[MM:SS]` become custom AST nodes (via
      `mdast-util-find-and-replace`, which only walks literal text nodes — code fences are
      untouched for free); `![video]`/`![audio]` get document-order `data-video-index`/
      `data-audio-index` assigned in the plugin (parse-time, StrictMode-safe) instead of a
      render-time counter. A custom `urlTransform` keeps `jnana-asset://`/`external://` alive
      (react-markdown's default sanitizer otherwise strips them to `""`). `[D1::Page n]` PDF
      page-jumps were found to be dead code (declared in docs, never wired to a renderer) and
      were **not** resurrected. Standard CommonMark newline semantics now apply (single newlines
      collapse; existing notes that relied on `pre-wrap` line breaks will reflow). Code
      highlighting is a deferred seam ([core/markdown/highlight.ts](src/core/markdown/highlight.ts))
      — no highlighter dependency added yet. Bundle grew ~160 KB (remark/unist ecosystem).
      **Also shipped (expanded scope): a composer `FormatToolbar`**
      ([core/markdown/format.ts](src/core/markdown/format.ts) +
      [ui/editor/FormatToolbar.tsx](src/ui/editor/FormatToolbar.tsx)) — bold/italic/strike/
      inline-code/H1/H2/bullet/numbered/quote/link/code-block buttons that wrap or prefix the
      textarea's current selection, wired into NoteCreator, NoteItem's edit mode, and NoteModal's
      edit mode.
- [x] **Live editor (CodeMirror 6)** ✅ DONE — `LiveEditor.tsx` + `LiveEditor.decorations.tsx`:
      Obsidian/Typora WYSIWYG edit mode — syntax hidden, bold/headings styled, media/wikilink/
      timestamp tokens rendered as interactive React widgets; reveals raw markdown near the cursor.
      Used in all three composers (NoteCreator, NoteItem, NoteModal). Right-click **context menu**
      (`ContextMenu.tsx` reusable) with formatting submenu, import submenu (inserts at click
      position), cut/copy/paste/paste-as-plain-text, "Add table" placeholder.
- [x] **Media resize + alignment + drag-rearrange + PDF thumbnail** ✅ DONE — `note_media_layout`
      table (v12); media widgets in the live editor get a `ResizableMediaFrame` with a hover toolbar
      (drag grip ⠿, L/C/R align, ▲/▼ reorder) + corner resize handle (pointer-capture, same pattern
      as canvas). Sizes persist off the note-save path. Embeds are always `inline-block`, so
      consecutive ones on a line form a **side-by-side row**; **alignment is applied as `text-align`
      on the container** (CM6 line / read-mode `<p>`), so aligning justifies the whole row instead of
      breaking it out. **Drag the grip** onto another embed — left/right edge = same row, top/bottom =
      stacked — a fixed `dropBar` previews the landing spot. PDF embeds replaced by a `PdfThumbnail`
      (~216×192 px, first page only; click opens full viewer). `core/markdown/format.ts` holds the
      pure transforms: `moveMediaBlock` (▲/▼ swap) and `rearrangeMedia` (drag → new document string).
- [x] **NoteModal fullscreen expand** ✅ DONE — ⤢/⤡ toggle fills the content area (excluding
      sidebar); edit mode inherits the expanded container automatically.
- [x] **Performance** ✅ DONE — `NoteItem` memoized; `useNotes()` return value memoized;
      `content-visibility: auto` on cards; favourites refetch only on new notes; pinned workspace
      links stay mounted through sidebar collapse.
- [ ] **Tables** — full spec in [TABLES.md](TABLES.md). Fenced `table` block holding CSV,
      rendered by a `TableEmbed` and authored via a hand-rolled grid `TableEditor` (add/remove
      row+col, **paste TSV from spreadsheets**), exported to a GFM pipe table. `remark-gfm` (GFM
      pipe tables) is now wired into the renderer — this block composes with that for display.

---

## Phase D — Scale & quality (measure before building)

- [ ] Metadata-only `get_all_notes` (defer content to note open) — only once list/graph load is
      measurably slow.
- [ ] `MarkdownLite` render cost: now a `react-markdown` AST parse per render (same "parses on
      view, not per keystroke" property as before — editing is a `<textarea>`). Revisit only if
      note-card-heavy views (e.g. a long Notes list) show measurable lag; memoize per note content
      string first, cheap and no new dependency.
- [ ] Embedding search scans all chunks per query — fine at personal scale; revisit only if
      retrieval latency becomes noticeable (>10k chunks).
- [ ] Grow test coverage alongside features (component tests via testing-library now available).

## Graph enhancements ✅ DONE

Earlier fixes: drag/zoom freeze (removed `pauseAnimation`), node-position cache so connecting
doesn't reflow the graph, and a connect-nodes mode (appends `[[title]]` to the source note so
the edge is durable).

All in `GraphView.tsx`; `GraphNode` carries `tags` + `createdAt` from `useGraph`. The controls
are organised as an **Obsidian-style settings panel** (top-right, collapsible accordion sections;
🎛 button to reopen when closed; reset-all ↺ + close ✕ on the Filters header). Hidden while the
focused-note panel is open.

- [x] **Node right-click menu** — Right-click a note for: **Connect to a note** (a rubber-band
      line follows the cursor — click any other note to link, or Esc to cancel), **Disconnect all
      links** (shown only when the note has ≥1 link; strips the matching `[[wikilink]]` from both
      sides via `stripWikilink` → `onUpdate`, so sync can't re-add it), and **Delete note**.
      Delete/connect use the **native Tauri `ask` dialog** — the WebView's `window.confirm` was
      ignoring Cancel here.
- [x] **Filters section** — narrows the visible set by free text (title/body/tags), an "updated
      within" date preset, an orphans-only toggle, and **tag chips** (moved in here); shows a live
      visible/total count + Clear.
- [x] **Groups section** — user-defined color categories (Obsidian "Groups"): each group is a
      query + color; `#tag`/`tag:` matches by tag, plain text matches the note title. First
      matching group colors the node. Replaces the old auto "Tags" coloring.
- [x] **Display section** — Arrows (directed edges, arrowhead at target), Highlight hubs & orphans
      (orphans degree 0 = small/amber, hubs ≥4 = large/ringed; mini-legend), Pin dragged nodes
      (`fx`/`fy` on drag end; off releases pins + reheats), and sliders for **Text fade threshold**
      (label alpha vs `globalScale`), **Node size** (radius multiplier) and **Link thickness**
      (`linkWidth`), plus an **Animate** button (`d3ReheatSimulation` + `zoomToFit`).
- [x] **Forces section** — sliders for center / repel / link force + link distance with live
      values, hints (full description on hover), "See clusters" / "Compact" presets and Reset.
      **Center force** is a custom `makeRadialForce` pulling nodes toward the origin (d3's built-in
      `forceCenter` only *recenters*, it doesn't compact), so higher = tighter & more circular.
- [x] **Compact jump-to-note** — top-left search shrunk to a single text box with a small
      results dropdown that focuses the chosen node (replaced the large `SearchDocs` card).

## View-state persistence ✅ DONE

Switching views unmounts the previous route (react-router), which used to drop all of its
in-progress state. Added `useViewState(key, initial)` ([src/hooks/useViewState.ts](src/hooks/useViewState.ts)) —
a drop-in `useState` backed by a **subscribable** module-level store (via `useSyncExternalStore`)
that outlives unmount/remount — and applied it to:

- Composer draft (`NoteCreator`: title / body / tags / favourite)
- Search query (`useSearch`; results recompute from it on remount)
- AI analyzer (`AiChat`: thread, scope kind/inputs, mode, composer text, **plus busy/error**)
- Graph settings (`GraphView`: filters, groups, display, forces, panel open-state)

Because the store is an external store with its own setters (not per-instance React state), an
**in-flight async request survives navigation**: if you switch away while the analyzer/quiz is
still running, the request keeps going and its result is written to the store when it resolves —
so it's there (and the spinner updates live) when you return. This was the missing piece: a plain
mirror-on-change store lost the answer because the resolving promise's `setState` targeted the
unmounted instance.

In-memory only (resets on a full app reload) — the goal was to stop losing work when navigating,
not disk persistence. Transient UI (hover, open dropdowns/menus, busy/error, focused node, open
note modals) is deliberately left un-persisted. AI provider settings already persist to disk via
`useRag`/`saveAiConfig`. If cross-reload persistence is wanted later, back the store with
`localStorage` (needs Set/array serialization for `filterTags`/`groups`).

## AI Chat — dual-mode + history + Styles/Skills/Projects ✅ DONE

Full design in [the plan file](../../Users/vravi/.claude/plans/add-following-features-in-buzzing-engelbart.md).
Shipped in phases:

- [x] **Dual mode** — toggle between **Focused AI Assist** (the grounded analyzer) and **AI Chat**
      (a streaming chatbot). Streaming via a Rust `ai_chat_stream` command over a Tauri `Channel`
      (raw SSE/NDJSON forwarded; parsed TS-side), with `ai_chat_cancel` for Stop.
- [x] **Native multimodal attachments** — images → vision blocks, documents → extracted text,
      audio → transcription; plus **attach Jnana notes** with an "include thread" checkbox that
      folds in the note's linked notes.
- [x] **Thinking toggle** (reasoning models) and **Deep research** — its own configurable endpoint
      in AI settings, else a best-effort system-prompt directive.
- [x] **Chat history** (SQLite `conversations`, migrate_v4) — collapsible per-mode sidebar with
      New chat / load / rename / delete; survives reload; in-flight streams still persist.
- [x] **Styles & Skills** (`ai_presets`, migrate_v5) — reusable system-prompt presets; composer
      picker (style select + skills multiselect) + manager modal; seeded defaults.
- [x] **Projects** (`ai_projects` + `ai_project_knowledge` + `conversations.project_id`,
      migrate_v6) — custom instructions + a knowledge base of attached notes/files that grounds
      every chat in the project; project picker + manager; the history drawer scopes to the active
      project. Knowledge is folded into context (capped); deeper per-doc embedding/retrieval is a
      future refinement.
- [x] UX polish — bottom-pinned composer with scrollable messages, model-name history dropdowns
      in settings, scrollable note picker.

## Agentic AI — Phase A ✅ DONE

Full roadmap (Phases A–D, incl. MCP) in [the plan file](../../Users/vravi/.claude/plans/add-following-features-in-buzzing-engelbart.md).
A tool-calling agent loop **inside AI Chat** (🤖 Agent toggle) with a **propose-then-confirm**
write policy — read tools run freely; writes are staged as proposals the user approves.

- [x] `chatWithTools` (provider) — OpenAI-compatible + Ollama tool-calling, degrades to a plain
      answer when a model lacks tool support.
- [x] Native tools (`core/ai/agent/tools.ts`): read = search / read / recent / graph_neighbors;
      staged writes = create / append / set_tags / link. Links stage **by title** so a freshly
      proposed note can be linked in the same run.
- [x] `runAgent` loop with a step cap, write de-duplication, and live step callbacks; reasoning
      narrated per step (`AgentSteps`).
- [x] `ProposalCard` Apply / Skip (+ Apply all). Apply composes `[[wikilinks]]` into the note and
      saves it once, so AI-applied links show as graph edges (fixed a link-sync race).
- [x] Message actions: ↻ retry under a prompt; right-click menu = edit & retry / fork from here /
      delete-from-here / delete message.
- [ ] **Phase B — MCP client** (agent uses external MCP servers via `rmcp`, Rust-side transport).
- [ ] **Phase C — MCP server** (expose the vault to Claude Desktop / other agents).
- [ ] **Phase D — background/scheduled agents** (optional; reuse Phase-A tools headless).

## Workspaces, Canvas & web embeds ✅ DONE

Named groups that organize notes without separate vaults — notes stay **global** and membership is
many-to-many, so removing a note from a workspace only drops the junction row. Shipped in phases:

- [x] **Core** (migrate_v8: `workspaces`/`workspace_notes`/`collections`/`collection_notes`) —
      a `/workspaces` manager + `/workspaces/:id` page with **Notes** and **Graph** tabs. Notes tab
      reuses the toolbar/filters/`NoteItem`/`filterNotes` with a **keyed** `useNotesViewPrefs` so
      workspace filters don't bleed into All Notes; Graph reuses `GraphView` with new `scopeIds` +
      `instanceKey` props (own layout/viewport). Add-existing-notes picker, per-workspace pin,
      export, quick-note capture into the active workspace, add-to-workspace from All Notes, pinned
      workspaces + sub-items in the sidebar.
- [x] **Dashboard + Collections** — a scoped dashboard (stat tiles, pinned, recent activity,
      continue-learning, recent imports) reusing the home dashboard's presentational widgets;
      Collections as sub-groups that chip-filter the Notes tab.
- [x] **Command palette + AI scope + Insights** — global Ctrl/⌘-K palette (mounted in AppLayout);
      a `retrieve()` scope (`setRetrievalScope` + `useAiScope` + shared `ScopeBar`) that points AI
      chat & Search at one workspace; an Insights tab (orphans / untagged / needs-indexing /
      suggested links, all derived client-side).
- [x] **Canvas** (migrate_v9: `canvases`) — a hand-rolled pointer-event freeform board per workspace
      (pan/zoom, node drag/resize, edge drawing, freehand ink via `perfect-freehand`), with
      text/note/media/web nodes, a note↔note "Link in graph" action that inserts one `[[wikilink]]`,
      and multiple named canvases. Stored as a JSON-Canvas-shaped doc; no canvas library (React-19
      `findDOMNode`), pointer events like DashboardGrid.
- [x] **Web-page embeds** (migrate_v10: `link_previews`) — `![webpage](url)` renders a preview card
      from Open-Graph metadata fetched + cached Rust-side (`fetch_link_preview`), with a best-effort
      Live view iframe (YouTube → `/embed/`); also a canvas web node. `has:webpage` auto-tag + chip +
      Notes filter.

## Explicitly deferred (don't do yet)

- Connection pool (`r2d2`/`deadpool`) — unnecessary for a single-user app.
- Tag schema normalization (`note_tags` table) — wait until tag *filtering* is a feature.
- Sync across devices — big decision; design after export (Phase B) exists.
- Plugin implementations/UI — lower value than completing the core feature set.
