# Jnana — Forward Plan

Last reorganized: 2026-06-13

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
- [ ] Establish design tokens / a small component layer; apply consistent styling across the
      now-complete feature set.
- [ ] Dark/light theme toggle (pure UI — belongs in this pass; students study at night).
- [ ] Replace the three `window.prompt` flows with proper modals: document-import choice
      (`useDocumentUpload.ts`), YouTube URL (`ComposerToolbar.tsx`), highlight edit
      (`PdfViewer.tsx`).
- [ ] CSP runtime check: confirm the `script-src 'self'` tightening holds in `tauri dev`;
      revisit `style-src 'unsafe-inline'` (needs nonces) only if worth it.
- [ ] **Hybrid markdown AST renderer (remark) — only if pursuing rich formatting.** NOT a perf
      fix: editing uses a `<textarea>`, so MarkdownLite only parses on *view*, not per keystroke
      (the "typing latency" claim doesn't apply). If many note cards re-parse on save, memoize
      parsed segments by content string first — cheap, no dependency. Adopt remark *only* to
      unlock real markdown (headings/bold/lists/code/**tables**). If so: do it as a hybrid —
      remark + remark-gfm for standard syntax, custom micromark/remark extensions for the
      app's tokens (`[[wikilink]]`, `![audio|video|youtube|pdf]`, `[V/A/D::…]`), rendering the
      AST to the **existing** embed components. Hardest part: preserve document-order media
      indexing (`data-video-index`/`data-audio-index`) for timestamp seeking. Adds ~100 KB+ to
      the bundle. Sequence after the polish items above.
- [ ] **Tables** — full spec in [TABLES.md](TABLES.md). Fenced `table` block holding CSV,
      rendered by a `TableEmbed` and authored via a hand-rolled grid `TableEditor` (add/remove
      row+col, **paste TSV from spreadsheets**), exported to a GFM pipe table. Ships on the
      current renderer; composes with remark-gfm later.

---

## Phase D — Scale & quality (measure before building)

- [ ] Metadata-only `get_all_notes` (defer content to note open) — only once list/graph load is
      measurably slow.
- [ ] `MarkdownLite` render cost: memoize parsed segments per note/line first; AST rewrite only
      if memoization isn't enough.
- [ ] Embedding search scans all chunks per query — fine at personal scale; revisit only if
      retrieval latency becomes noticeable (>10k chunks).
- [ ] Grow test coverage alongside features (component tests via testing-library now available).

## Graph enhancements (next session)

Fixed already: drag/zoom freeze (removed `pauseAnimation`), node-position cache so connecting
doesn't reflow the graph, and a connect-nodes mode (appends `[[title]]` to the source note so
the edge is durable). Remaining ideas, roughly best value-for-effort first:

- [ ] **Disconnect a link** — the complement to Connect; the feature is one-way without it. A
      click-an-edge or "disconnect mode" that **strips the `[[wikilink]]` from the source note's
      content** (mirror of connect — not a raw `dropLink`, or sync would re-add it). `useGraph`
      has `dropLink` but it must go through content to be durable.
- [ ] **Tag-based coloring / clustering** — color or cluster nodes by tag. Highest "this is my
      second brain" payoff and reuses the existing tag system the graph currently ignores.
- [ ] **Orphan / hub highlighting** — flag notes with no links (worth connecting) and heavily
      linked hubs; cheap to compute from edges.
- [ ] **Filter the visible graph** — by tag / date / search match (search currently only focuses
      one node; let it narrow the visible set).
- [ ] **Directed edges** — arrowheads showing which note links to which (links are directional).
- [ ] **Pin layout** — let dragged nodes stay put instead of the force layout reflowing them.

## Explicitly deferred (don't do yet)

- Connection pool (`r2d2`/`deadpool`) — unnecessary for a single-user app.
- Tag schema normalization (`note_tags` table) — wait until tag *filtering* is a feature.
- Sync across devices — big decision; design after export (Phase B) exists.
- Plugin implementations/UI — lower value than completing the core feature set.
