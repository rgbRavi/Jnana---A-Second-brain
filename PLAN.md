# Jnana — Forward Plan

Audit date: 2026-06-12 · Branch: `feature/ai-rag-layer`

Build health at time of audit: `tsc --noEmit` clean · `vitest` 4/4 passing · `cargo check` clean.

---

## Audit summary

The architecture is genuinely good for this stage: clean `ui → hooks → core → invoke` layering,
an event bus that keeps notes/links/search/RAG in sync, and a new AI layer with a proper
provider abstraction (OpenAI-compatible + Ollama), note chunking, and a SQLite-backed vector
store with in-process cosine search. The existing `technical_audit.md` is broadly right about
the risks, with two caveats: the single `Mutex<Connection>` is fine for a single-user desktop
app (a connection pool is premature), and schema normalization of tags can wait until tag
filtering actually exists as a feature.

Verified issues, in priority order:

1. **Path traversal in `jnana-asset://`** (`src-tauri/src/main.rs`) — the URI path is joined
   onto `assets_dir()` with no `..` / absolute-path check. Any embedded content can read
   arbitrary host files. Trivial fix.
2. **`ai_fetch` is an open HTTP proxy** (`src-tauri/src/commands/ai.rs`) — any WebView code
   (including future worker plugins) can request any URL with any headers. Combined with the
   API key sitting in `localStorage` (`src/core/ai/config.ts`), this is an exfiltration path.
   The comments in `provider.ts`/`ai.rs` claim the key "never lives in browser-reachable
   state" — currently untrue.
3. **`syncLinksForNote` is O(N) per save** (`src/core/notes.ts:75`) — fetches *all* notes and
   *all* links over IPC on every save just to diff one note's wikilinks.
4. **`useSearch` rebuilds the entire MiniSearch index on every keystroke**
   (`src/hooks/useSearch.ts:37-60`) — the build effect depends on `[notes, query]`, defeating
   the incremental `updateIndexedNote` handlers that already exist.
5. **Stale docs** — README/PROGRESS still say full-text search and tagging don't exist; both
   shipped. PROGRESS last updated 2026-04-20, pre-AI-layer.
6. **Dead code / hygiene** — `src-tauri/src/lib.rs` is an unused duplicate entry point with an
   empty `invoke_handler`; `package.json` is named `"npm"`; the `Cargo.toml` working-tree
   change is line-endings only.
7. **Test desert** — only `eventBus` is tested, while `chunk.ts`, the `analyze` JSON parser,
   `tags.ts`, and `search.ts` are pure functions that are cheap to cover.

---

## Phase A — Hardening sprint (do first, ~1–2 days)

- [ ] Reject `..`, path separators, and absolute paths in the `jnana-asset` handler
      (canonicalize and verify the result is inside `assets_dir()`).
- [ ] Restrict `ai_fetch` to the configured provider host (pass an allowlisted base URL into
      managed state, or validate the URL host against the saved config on the Rust side).
- [ ] Decide on API-key storage: move it to a Rust-side config file (or keyring) and have
      Rust inject the Authorization header — or update the comments to admit the tradeoff.
- [ ] Fix `useSearch`: build the index once per notes-load, keep incremental updates via the
      existing event handlers, and drop `query` from the build effect's deps.
- [ ] Replace `syncLinksForNote` with a Rust command `sync_links(note_id, titles)` that does
      the title→id resolution and link diff inside SQLite (one IPC call, no full-table pull).
- [ ] Delete `src-tauri/src/lib.rs` (or make `main.rs` a thin wrapper around it — pick one).
- [ ] Rename `package.json` from `"npm"` to `"jnana"`; resolve the Cargo.toml line-ending noise.
- [ ] Refresh README + PROGRESS to match reality (search ✅, tags ✅, favourites ✅, AI layer 🚧).

## Phase B — Finish the AI layer (current branch's mission)

- [ ] Merge `feature/ai-rag-layer` once `ai_fetch` is locked down.
- [ ] Index staleness: compare note `updated_at` vs embedding `created_at`; surface
      "N notes need (re)indexing" in `AiSettingsPanel` instead of relying on the user to
      remember to reindex after editing with AI off.
- [ ] **Tag suggestions** (next per your own roadmap): reuse `retrieve()` + existing-tag
      vocabulary, suggest existing tags first, show why, one-click accept/reject. Never
      auto-mutate notes.
- [ ] **Link suggestions**: for a note, retrieve nearest chunks from *other* notes and offer
      "[[wikilink]] to X?" with the overlapping passage as evidence. Fits the graph identity.
- [ ] **Quiz generator** third, built on the analyzer's keyConcepts/weakSpots output.
- [ ] Tests: `chunk.ts` (cleaning + splitting), `analyze.ts` `parseAnalysis` (fences, prose,
      garbage), config merge in `config.ts`.

## Phase C — UX debt blocking real users (from `things to do.txt`)

- [ ] Replace the three `window.prompt` flows with proper modals: document-import choice
      (`useDocumentUpload.ts:46`), YouTube URL (`ComposerToolbar.tsx:22`), highlight edit
      (`PdfViewer.tsx:208`).
- [ ] Dark/light theme toggle — the last Phase 1 item; students study at night.
- [ ] Markdown export (per note + bulk) — doubles as the Phase 2 "markdown mirror" and the
      "students need to submit/share" gap.
- [ ] Audio player — reuse the video pipeline (`media_refs`, asset protocol, Plyr audio mode).

## Phase D — Scale & quality (ongoing, measure before building)

- [ ] Rust-side tests for queries + the new `sync_links` command.
- [ ] When note count grows: metadata-only `get_all_notes` (defer content to note open).
      Don't build this until list/graph load is measurably slow.
- [ ] `MarkdownLite` render cost: memoize parsed segments per note/line first; only reach for
      a remark/AST rewrite if memoization isn't enough.
- [ ] Embedding search currently scans all chunks per query — fine at personal scale;
      revisit only if retrieval latency becomes noticeable (>10k chunks).

## Explicitly deferred (don't do yet)

- Connection pool (`r2d2`/`deadpool`) — unnecessary for a single-user app.
- Tag schema normalization (`note_tags` table) — wait until tag *filtering* is a feature.
- Sync across devices — big architectural decision; design after export exists.
- Plugin implementations/UI — the AI features are more valuable and don't need the plugin
  system to ship.
