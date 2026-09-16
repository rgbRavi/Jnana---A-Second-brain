# PDF reference pins + annotation indexing — design

**Date:** 2026-07-30
**Status:** Approved (design), pending spec review

Two related additions to the PDF layer:

1. **Reference pins** — click a spot in a PDF, store it as a blue-dot annotation, and get a
   portable `[D<n>::p<page>@x,y]` reference you can copy or drop into a note; clicking that
   reference jumps back to the exact page + point.
2. **Annotation indexing** — fold PDF annotation text (`pdf_text`, `pdf_highlight`) into the
   existing search + RAG indexes so annotations are findable (closing the gap where annotation
   content is invisible to both keyword and AI search).

---

## Feature 1 — PDF reference pins

### 1.1 Data model — new `pdf_ref` annotation kind

Reuse the `annotations` table. **No migration** — `kind`/`position` are opaque TEXT, and Rust's
`save_annotation` already maps unknown kinds to media_type `"pdf"` (same as `pdf_text`/`pdf_ink`
needed none).

- `kind = 'pdf_ref'`
- `position` JSON = `{ x, y }` in **PDF-point space** (via `viewport.convertToPdfPoint`, the same
  space `pdf_text`/`pdf_ink` store), page-scoped like every other kind.
- `content` unused (pins are pure coordinates — no caption; YAGNI, add later if wanted).

`usePdfAnnotations` gains a `pdf_ref` branch (parse `pos.x`/`pos.y` into a `PdfRef[]`) and a
`createRef(x, y)` mutator, mirroring `createText`.

### 1.2 Token format

```
[D<n>::p<page>@<x>,<y>]
```

- `n` — the PDF's occurrence index in the note, **0-based** (`D0` = the first `![pdf]`), document
  order, mirroring `[V0::]`/`[A0::]`.
- `page` — 1-based page number.
- `x,y` — the point **normalized to 0–1 of the page** (zoom/size-independent, export-safe).
- Example: `[D0::p4@0.42,0.68]`

Regex source lives in `core/markdown/tokenPatterns.ts` next to the existing timestamp sources:

```ts
export const DOC_REF_SOURCE = '\\[D(\\d+)::p(\\d+)@([0-9]*\\.?[0-9]+),([0-9]*\\.?[0-9]+)\\]'
export const docRefRegex = (): RegExp => new RegExp(DOC_REF_SOURCE, 'g')
```

Normalized coords (0–1) are stored in the **token**; the pin annotation stores **PDF points**. The
capture step converts points → normalized (divide by page width/height) when building the token.

### 1.3 Rendering — chip shows `📄 p.<page>`

Raw source stays `[D0::p4@…]`; the chip **displays `📄 p.4`**.

- **Read mode** — `remarkJnana` converts a `docRefRegex()` match into a `jnana-doc-ref` mdast node
  carrying `{ pdfIndex, page, x, y }`; `MarkdownLite` maps it to a `DocRefChip` component.
- **Edit mode** — `lezerJnana` + the CM6 decoration pass replace the token range with the same
  `DocRefChip` widget (reveal-near-cursor, like timestamps/wikilinks).
- `DocRefChip` renders `📄 p.{page}`, `title="Jump to page {page}"`, and on click emits
  `pdf:open` (below).

### 1.4 Capturing a pin (PdfViewer)

Add a **`ref` tool** to the existing tool set (`select | highlight | pen | eraser | text` →
**+ `ref`**), reachable from the toolbar + the right-click `ContextMenu`, same as the other tools.

With `ref` active, a click on the page:
1. converts to a PDF point, calls `createRef(x, y)` → a **blue dot** renders at that point
   (persists on reopen, like every annotation),
2. opens a small popover anchored at the dot with three actions:
   - **Copy reference** — `navigator.clipboard.writeText('[D<n>::p<page>@x,y]')`
   - **Append to note** — calls `props.onAppendRef(token)` (see 1.5)
   - **Delete** — removes the pin annotation.

Clicking an existing blue dot (in `select` mode) re-opens the same popover.

The blue dot is a new overlay marker in `PdfViewer`'s annotation layer, colour `--accent`-independent
**blue** (a fixed reference colour, distinct from highlight/ink). Rendered in the same coordinate
overlay as `pdf_text`, converting stored PDF points → viewport for the current zoom.

### 1.5 "Append to note" routing — a prop, not a guessing game

`PdfViewer` takes a new optional `onAppendRef?: (token: string) => void`, supplied by whichever
context opened it, so the append lands in the right place with no cross-component event guessing:

- **Read-mode `PdfEmbed`** (card/modal/reader — note is *not* being edited): `onAppendRef` appends
  the token to the note's content and saves via the notes core, emitting `note:saved`. Safe: no live
  editor buffer to clobber.
- **Live-editor `PdfEmbed` widget** (note *is* being edited): `onAppendRef` inserts the token at the
  editor cursor via the existing `LiveEditorHandle.insertAtCursor` (no DB write, no autosave race).
- **Canvas** PDFs stay `readOnly` — no pinning, `onAppendRef` omitted (Copy still works).

`n` (the pdf index for the token) is supplied by the opening `PdfEmbed`, which knows its own
document-order index (see 1.6).

### 1.6 PDF document-order index

Currently only `![video]`/`![audio]` get a parse-time `data-*-index`. Add the same for PDFs:

- `remarkJnana` assigns `data-pdf-index` to each `![pdf]` image node in document order.
- `MarkdownLite` reads it and passes `pdfIndex` into `PdfEmbed`; `PdfEmbed` uses it only to build
  the reference token when capturing a pin (§1.5). Jump-back does **not** need it — the chip resolves
  the filename independently via `nthPdfFilename` (§1.7).

A pure helper `nthPdfFilename(content: string, n: number): string | null` (in
`core/markdown/pdfRef.ts`, tested) extracts the **0-based** nth `![pdf](jnana-asset://…)` filename
from note content (`n = 0` → first PDF; returns `null` if out of range).

### 1.7 Jump-back — global PDF viewer host

Clicking a `DocRefChip` opens the referenced PDF at the page + point, **decoupled from the embed's
own fullscreen** (simpler than reaching into a specific `PdfEmbed`):

- A single **`PdfRefViewerHost`** mounts once in `AppLayout`, listening for the `pdf:open` event.
- `DocRefChip` (which has the note's `noteId` + content in scope) resolves `nthPdfFilename(content,
  pdfIndex)` → filename, then emits `pdf:open { filename, noteId, page, x, y }`.
- The host renders a `PdfViewer` in a portal overlay (Escape/backdrop to close), drives it to `page`
  via the now-wired `onRegisterPageSetter`, then **scrolls the point into view and pulses** a
  transient marker at `(x, y)`.
- This finally connects `onRegisterPageSetter`, currently a dead prop.

`PdfViewer` gains one imperative **reveal path**: the host, after mounting the viewer and setting the
page via `onRegisterPageSetter`, calls a registered `revealPoint(page, x, y)` (registered the same
way as the page setter) which scrolls the point into view and renders a transient pulse marker. The
host is the only caller that needs this, so the pulse lives entirely in `PdfViewer`, off by default.

### 1.8 New eventBus events

- `pdf:open { filename, noteId, page, x, y }` — chip → global host.

(Append uses a prop callback, not an event; Copy is local.)

---

## Feature 2 — Annotation indexing

### 2.1 Mechanism — fold annotation text into `attachment_text`

Both indexes already read one store: keyword (`useSearch` → `getAttachmentText`/
`getAllAttachmentText` → `updateIndexedNote`/`createNoteIndex`) and RAG (`indexNote` →
`getAttachmentText` → `chunkNote(note, extra)`), both re-running on `note:saved`. `get_attachment_text`
concatenates all rows for a note. So annotation text can be stored as **another `attachment_text`
row** and both indexes ingest it for free — **no migration, no index-code change**.

### 2.2 New hook `usePdfAnnotationIndex` (mounted once in AppLayout)

Mirrors `usePdfTextIndex`:

- Subscribes to `annotation:created` / `annotation:updated` / `annotation:deleted`.
- For a PDF annotation event, loads that note's `pdf_text` + `pdf_highlight` content (a core helper
  `listPdfAnnotationText(noteId): Promise<string>` concatenating the `content`/`text` of those kinds
  across pages), then `saveAttachmentText(noteId, '<annotations>', text)` under a reserved
  pseudo-filename, and **re-emits `note:saved`** so both indexers re-ingest.
- `pdf_ref` and `pdf_ink` contribute no text (skipped).
- Guard: the hook only listens to `annotation:*`, never `note:saved`, so its own re-emit can't loop.

### 2.3 Result

A phrase typed as a PDF text-box annotation, or the note on a highlight, becomes findable by both
keyword search and AI/RAG retrieval — same as the PDF's printed text already is.

---

## Components touched

**Feature 1**
- `core/markdown/tokenPatterns.ts` — `DOC_REF_SOURCE` / `docRefRegex`.
- `core/markdown/remarkJnana.ts` — `jnana-doc-ref` node; `data-pdf-index` on `![pdf]`.
- `core/markdown/lezerJnana.ts` + CM6 decorations — edit-mode chip widget.
- `core/markdown/pdfRef.ts` (new) — `nthPdfFilename`, token build/parse helpers (pure, tested).
- `ui/editor/DocRefChip.tsx` (new) — the `📄 p.N` chip.
- `ui/editor/MarkdownLite.tsx` — map node → chip; thread `pdfIndex` to `PdfEmbed`.
- `ui/editor/NoteEmbeds.tsx` (`PdfEmbed`) — accept `pdfIndex`, supply `onAppendRef`.
- `ui/media/PdfViewer.tsx` — `ref` tool, blue-dot marker, popover, `onAppendRef`, reveal/pulse,
  wire `onRegisterPageSetter`.
- `hooks/usePdfAnnotations.ts` — `pdf_ref` parse + `createRef`.
- `ui/PdfRefViewerHost.tsx` (new) + mount in `AppLayout.tsx`.
- `lib/eventBus.ts` — `pdf:open`.

**Feature 2**
- `core/annotations.ts` — `listPdfAnnotationText(noteId)`.
- `hooks/usePdfAnnotationIndex.ts` (new) + mount in `AppLayout.tsx`.

## Testing

- `pdfRef.test.ts` — token build/parse round-trip, `nthPdfFilename` (0/1/n, missing).
- `tokenPatterns` / `remarkJnana` / `lezerJnana` tests — `[D0::p4@x,y]` tokenizes and renders to a
  `jnana-doc-ref` node, and does **not** collide with existing wikilink/timestamp parsing (and stays
  literal inside code fences, like the other tokens).
- `usePdfAnnotationIndex` — an `annotation:created` for a pdf triggers `saveAttachmentText` +
  `note:saved` re-emit; non-pdf kinds are ignored; re-emit doesn't loop.
- Coordinate normalization — points → normalized (0–1) → back within a page round-trips.

## Out of scope / known ceilings

- No pin captions (pure coordinates).
- Canvas PDFs remain read-only (no pinning).
- Jump-back opens a fresh viewer overlay rather than re-focusing an already-open embed viewer —
  acceptable; the point-pulse makes the location obvious.
- `pdf_ink` strokes stay unindexed (no text).
