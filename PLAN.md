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
2. **Voice recording (mic)** ← CURRENT. The capture half of audio: a record button →
   `MediaRecorder` → `uploadAsset` (the bytes path images use) → `![audio]` embed, reusing the
   player and `[A0::…]` timestamps already built. Output is webm/opus. **Risk:** WebView2
   microphone permission — must be verified on Windows; deny/no-mic shows a clear message.
3. **Voice transcription** (bigger; its own item, after recording). record → text so memos
   become full-text searchable *and* AI-analyzable, with `[A0::…]` synced back to the audio.
   Needs a model decision: a **local Whisper sidecar** (keeps local-first, mirrors the Ollama
   option) or **cloud STT** (same tradeoff as the OpenAI provider). Async processing + a
   "transcribe" action on an audio embed.
4. **Markdown export** — write notes out as `.md` (per-note + bulk). Doubles as the "markdown
   mirror" and the student "submit/share" gap. Decide: target folder via dialog; how to handle
   `jnana-asset://` / `external://` references (rewrite to relative paths or note them).
5. **AI tag suggestions** — reuse `retrieve()` + existing-tag vocabulary; suggest existing tags
   first, show why, one-click accept/reject. Never auto-mutate notes.
6. **AI link suggestions** — for a note, retrieve nearest chunks from *other* notes and offer
   "[[wikilink]] to X?" with the overlapping passage as evidence.
7. **Quiz generator** — built on the analyzer's keyConcepts/weakSpots output.
8. **AI index staleness** — compare note `updated_at` vs embedding `created_at`; surface
   "N notes need (re)indexing" in the settings modal.

---

## Phase C — Polish & consistency pass (after Phase B's feature set is stable)

- [ ] Extract a shared `<Modal>` component (NoteModal + AI settings modal currently duplicate
      the overlay/container pattern) and reuse everywhere.
- [ ] Establish design tokens / a small component layer; apply consistent styling across the
      now-complete feature set.
- [ ] Dark/light theme toggle (pure UI — belongs in this pass; students study at night).
- [ ] Replace the three `window.prompt` flows with proper modals: document-import choice
      (`useDocumentUpload.ts`), YouTube URL (`ComposerToolbar.tsx`), highlight edit
      (`PdfViewer.tsx`).
- [ ] CSP runtime check: confirm the `script-src 'self'` tightening holds in `tauri dev`;
      revisit `style-src 'unsafe-inline'` (needs nonces) only if worth it.

---

## Phase D — Scale & quality (measure before building)

- [ ] Metadata-only `get_all_notes` (defer content to note open) — only once list/graph load is
      measurably slow.
- [ ] `MarkdownLite` render cost: memoize parsed segments per note/line first; AST rewrite only
      if memoization isn't enough.
- [ ] Embedding search scans all chunks per query — fine at personal scale; revisit only if
      retrieval latency becomes noticeable (>10k chunks).
- [ ] Grow test coverage alongside features (component tests via testing-library now available).

## Explicitly deferred (don't do yet)

- Connection pool (`r2d2`/`deadpool`) — unnecessary for a single-user app.
- Tag schema normalization (`note_tags` table) — wait until tag *filtering* is a feature.
- Sync across devices — big decision; design after export (Phase B) exists.
- Plugin implementations/UI — lower value than completing the core feature set.
