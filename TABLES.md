# Tables — feature doc (shipped)

## Status

**Shipped.** Create a table without touching raw syntax (a rows×cols picker), **edit it inline in
the live editor** (a grid you type into — no modal), colour the header, paste straight from
Excel/Google Sheets, render it cleanly in read view, and export it to a portable GFM pipe table.

This doc describes what's built; the original spec assumed the old regex `MarkdownLite` and a modal
editor — both superseded (see [PROGRESS.md](PROGRESS.md) / [PLAN.md](PLAN.md)). The
[Future ideas](#future-ideas--backlog) section at the end lists what's intentionally deferred.

**Explicitly out of scope** (it's a *notes* table, not a spreadsheet): formulas, conditional/cell
formatting, thousands of rows, virtualization. For that, a `.csv` attachment + a real tool is the
honest escape hatch. No heavy data-grid library — the grid is hand-rolled. (Lightweight **sorting**
and **filtering** *are* now supported — see below — but they're a convenience view, not a data engine.)

---

## Storage format

A fenced block with a `table` info string holding **CSV (RFC-4180-style)**, first row = header:

````
```table
Method,Accuracy,Notes
baseline,0.71,"reference run, no tuning"
ours,0.86,best so far
```
````

- Plain text → diff-friendly, portable, survives in the raw note.
- A note containing a ` ```table ` fence gets a **`has:table` auto-tag** (inferred in
  [core/tags.ts](src/core/tags.ts) via `TABLE_BLOCK`), so it's filterable in the Notes gallery like
  `has:webpage`/`has:pdf`.
- CSV quoting handles commas/quotes/newlines in a cell (a cell with `,`, `"`, or a newline is wrapped
  in `"`, embedded `"` doubled). **Paste** from spreadsheets is TSV; it's converted to cells on the
  way in.
- **Presentation options** ride in the fence info string as space-separated `key=value` tokens —
  `header=<name|#hex>` (header-row colour), `w=<rem,rem,…>` (per-column widths),
  `h=<rem,rem,…>` (per-row heights, index 0 = header), and `align=<lcr…>` (per-column alignment,
  one `l`/`c`/`r`/`-` code per column):

  ````
  ```table header=indigo w=9,14,6 h=2.4,3 align=-cr
  Name,Score
  a,1
  ```
  ````

  Unknown keys are ignored (stays portable). Colour, widths, and heights are dropped on GFM export —
  but **column `align` survives** (emitted as `:---` / `:--:` / `---:` in the separator row), the only
  presentation option that does.
- **Format flags** (bare tokens) + **aggregates** also ride the info string: `noheader` (treat row 0
  as data), `zebra` (stripe body rows), and `agg=<sacnx…>` (per-column footer aggregate —
  `s`um/`a`vg/`c`ount/mi`n`/ma`x`, `-` = none).
- **Cells can hold multiple lines.** In the grid editor, **Shift+Enter** inserts a newline in the cell
  (plain **Enter** still moves down a row, **Tab** between cells); the newline round-trips via RFC-4180
  quoting and renders as a line break in read-mode (→ `<br>` on GFM export).

---

## Architecture

### Core helpers — [src/core/table.ts](src/core/table.ts) (pure, tested)

`TableData = string[][]` (rows of cells; `row[0]` = header; rectangular after parse). No dependencies;
covered by [table.test.ts](src/core/table.test.ts).

| Helper | Purpose |
|---|---|
| `parseCsv` / `serializeCsv` | RFC-4180 round-trip; ragged rows padded to max width |
| `parseClipboard` | TSV (spreadsheet paste) → cells |
| `tableToGfm` | grid → GFM pipe table (escapes `\|`, in-cell newlines → `<br>`) — used by export |
| `TABLE_BLOCK` | matches a whole ` ```table ` block; group 1 = info suffix, group 2 = CSV |
| `parseTableMeta` / `serializeTableMeta` | fence info ⇄ `{ header?, colWidths?, rowHeights? }` |
| `buildTableBlock(csv, meta?)` | assemble a full ` ```table ` fence |
| `emptyCsv(rows, cols)` | CSV for a new blank grid |
| `insertRow(rows, at)` / `insertColumn(rows, at)` | insert a blank row/col *between* existing ones |
| `sortRowsByColumn(rows, col, dir)` | numeric-aware sort of the data rows (header fixed, empties last) |
| `insertMetaAt` / `removeMetaAt` / `moveMetaAt` | keep the `w=`/`h=` arrays aligned after a structural edit |
| `replaceTableBlock(content, occ, csv, meta?)` | rewrite the `occ`-th block (edit writeback) |
| `deleteTableBlock(content, occ)` | remove the `occ`-th block, closing the blank-line gap |

### Read-mode — via `remarkJnana`, not a regex splice

A ` ```table ` fence parses as an mdast `code` node with `lang: 'table'`.
[remarkJnana.ts](src/core/markdown/remarkJnana.ts) has a `visit(tree, 'code')` pass that converts it
into a custom `jnana-table` block node (same `data.hName`/`hProperties` mechanism as the inline
tokens), carrying the raw `csv`, a parse-time document-order `occurrence` index (like the media
indices), and the parsed `header` colour. [MarkdownLite.tsx](src/ui/editor/MarkdownLite.tsx) maps
`jnana-table` → `TableEmbed` ([NoteEmbeds.tsx](src/ui/editor/NoteEmbeds.tsx)), a read-only accessible
`<table>` (`<th scope="col">`, horizontally scrollable) with the header tint applied. **remark-gfm
pipe tables are untouched** — only ` ```table ` fences are intercepted.

**Non-destructive view layer.** `TableEmbed` adds a light interactive layer over the rendered copy
that **never touches the stored CSV**: click a header to **sort** (cycles off → asc → desc; a ▲/▼
indicator, numeric-aware via `sortRowsByColumn`), and a **⌕ filter** toggle reveals a box that hides
rows not matching a case-insensitive substring. Both operate on `parseCsv(csv)` at render time, so
reopening the note shows the original order/rows. Per-row heights (`h=`) apply only in document order
(a view sort/filter drops them — cells still wrap, so nothing hides). This is why the read view is a
"peek": to change the data you edit inline in the live editor.

**Horizontal scroll.** Wide tables scroll inside `.noteTableScroll` (`overflow-x:auto`); the read
containers that host it — the gallery card, `NoteModal` body (normal + fullscreen) — carry
`min-width:0` so a wide table shrinks its flex column and scrolls instead of being clipped/widening.
For a **tall + wide** table whose own scrollbar is below the fold, a **floating horizontal scrollbar**
([TableStickyScrollbar.tsx](src/ui/editor/TableStickyScrollbar.tsx)) rides the bottom edge of the
table's **clip container** and proxies `.noteTableScroll`'s `scrollLeft` (two-way). "Is the native bar
reachable?" is tested against the nearest **clipping ancestor**'s bottom (`clipRectFor` — intersection
of every `overflow ≠ visible` ancestor with the viewport), **not** the viewport bottom — so it works
inside a scroll container like the **`NoteModal` body** (whose bottom is above the viewport bottom;
using `innerHeight` there kept the bar from ever showing). It shows only while the table overflows
horizontally *and* its bottom is clipped, positions itself at the clip's bottom edge, and hides once
the native scrollbar is reachable; it's portaled to `<body>` and used by both the read `TableEmbed`
and the edit grid. It listens for
`scroll` in the **capture phase** (any ancestor scroll container can move it) + a `ResizeObserver`.
Sync is one-directional per source to avoid a feedback loop: the proxy's `onScroll` drives the real
element's `scrollLeft`; the real element's own scroll mirrors back to the proxy. The capture-phase
listener only recomputes geometry and mirrors **when `e.target` is the real element** — never for a
proxy-originated scroll (which fires in capture before `onScroll` runs, and used to yank the proxy
back to the element's stale position: the "resists and snaps left" bug).

> Table borders are styled on the `.noteTable` class itself (not the `.root table` rules), because the
> live-editor widget renders in a detached CM6 widget root with no `.root` ancestor — otherwise the
> grid renders borderless.

### Edit-mode (live editor) — two behaviors, a settings toggle

A per-user setting `tableEditMode` (`'widget'` | `'inline'`) in
[useComposerOptions.ts](src/hooks/useComposerOptions.ts), surfaced in **Settings → Composer**:

- **`'widget'` (default)** — the block renders as an **inline editable grid** (`EditorTableWidget` in
  [NoteEmbeds.tsx](src/ui/editor/NoteEmbeds.tsx)): cells are **auto-growing textareas** (multi-line —
  **Shift+Enter** for a newline, **Tab** between cells, **Enter** down a row, **Tab on the last cell
  appends a row**); paste **TSV *or* a GFM pipe table** to bulk-fill (`parseGfmTable` converts a pasted
  `| a | b |` table — with its alignment — into the grid);
  add/delete row+column; **insert a row/column *between* existing ones** via the **⊕** button on each
  gutter control (insert-above for rows, insert-left for columns; the `+ Row`/`+ Column` bar still
  appends); **drag the row/column grips (⋮⋮) to reorder** (a portaled ghost shows the dragged row's/
  column's contents while dragging); **drag a column's right edge to resize** it (`w=` meta), **a
  row's bottom edge to resize** its height (`h=` meta), and **the bottom-right corner to scale the whole
  table** — a horizontal drag scales all column widths, a vertical drag all row heights, and a diagonal
  drag both (each axis engages only once the pointer moves >3px on it, so a straight drag stays 1-axis);
  **sort by a column** with the **▲/▼** controls
  on the column gutter (commits an undoable reorder of the CSV — distinct from read-mode's view-only
  sort; clears any `h=` heights since a reorder makes them meaningless); a **🎨 Header** swatch picker
  (the shared `COLOR_PALETTE`); a **🗑 Delete** button (confirms). **Cell typing is local** and
  syncs when you leave the table (focus-out / pointer-down outside / unmount) — a per-keystroke doc
  write would recreate the widget and drop focus. **Structural edits** (add/delete, reorder, resize,
  colour) commit **immediately**, so each is a normal, **undoable** (Ctrl+Z) edit.
  - **The widget updates in place across its own edits — no jump-to-top / focus loss.** A structural
    commit changes the CSV, so the rebuilt decoration produces a semantically-different `TableWidget`
    (`eq()` false), which previously made CM6 **destroy and recreate** the widget (losing scroll +
    focus every edit). `ReactWidget.updateDOM` ([LiveEditor.decorations.tsx](src/ui/editor/LiveEditor.decorations.tsx))
    now re-renders into the **existing** DOM node instead (CM6's block-widget reuse path, guarded by
    `constructor` match), so the React component — and its scroll position and caret — survive. An
    **external** change (undo/redo) still reconciles: an effect re-seeds local state when the incoming
    csv/meta differs from the local (canonical-form) state, while our own commits echo back a match and
    no-op. This applies to every React widget (media playback no longer resets on nearby edits, too). The commit is a
  **targeted range replace** of just that block (`tableBlockRange`), not a full-document replace — that
  keeps the surrounding selection/scroll stable (**no jump on add/delete row**) *and* makes the edit
  undoable. A `deletedRef` guard stops a stale re-commit after delete. Columns have a **fixed default
  width** so a long imported cell scrolls in-cell instead of stretching the table.
  - **Insert/delete refocus a valid cell afterwards** (`focusCell`) — this keeps the CM6 editor focused
    so **Ctrl+Z undoes the edit**, and scrolls the new/neighbouring cell into view so a column inserted
    off to the right in a wide table isn't invisible.
  - **Format:** `noheader` drops the header styling (row 0 becomes data), `zebra` stripes body rows, and
    `agg=` renders a read-only **aggregate footer row** (`computeAggregate` per column). All three apply
    in read-mode ([TableView](src/ui/editor/NoteEmbeds.tsx)) and the edit grid, and round-trip via the
    fence meta. Read-mode also gets a **sticky header** — the read container is height-capped
    (`.noteTableWrapper .noteTableScroll { max-height }`) so a tall table scrolls internally and the
    `<th>` pins (`position: sticky` needs a bounded scroll ancestor; the edit grid is left uncapped).
  - **Row/table resize are DOM-direct** — the height/width is written straight to the element during the
    drag (no per-move React re-render, so it's smooth and the handle can't reflow away from the pointer)
    and committed to state + the doc only on pointer-up. `h=` is a **dense** array (`0` = auto), so
    resizing one row never snaps the others taller. Edge/corner handles live inside a small grid padding
    so `overflow-x:auto` (which forces `overflow-y:auto`) doesn't clip them. Column/table minimums are
    deliberately tiny (`MIN_COL_W ≈ 1.2rem`) so you can **squish a column right down even with content**
    (text wraps/reflows) — the aim is free resizing, not a content-driven floor.
  - This widget lives in a **`StateField`** ([LiveEditor.decorations.tsx](src/ui/editor/LiveEditor.decorations.tsx)
    `tableDecorationsField`), **not** the `liveDecorations` ViewPlugin: CM6 forbids plugins from
    providing **block / line-crossing** decorations, and a table fence spans multiple lines. The
    field rebuilds on doc/selection change (reveal-near-cursor) and on a `forceRebuildTables` effect
    dispatched when the setting toggles.
- **`'inline'`** — the raw ` ```table ` CSV fence shows as-is, like any other fenced code.

### Right-rail Table tools ([ui/rail/](src/ui/rail/))

An **app-global collapsible toolbar rail** ([RightRail.tsx](src/ui/rail/RightRail.tsx)) sits on the far
right of the flex `appShell` (a flex sibling after `<main>`, so opening it shrinks the composer + list
with no width math — same layout trick as [FileExplorer.tsx](src/ui/folders/FileExplorer.tsx)). It's an
**extensible dock**: panels come from a registry ([lib/rightRailPanels.ts](src/lib/rightRailPanels.ts),
mirroring [pluginContributions.ts](src/lib/pluginContributions.ts)) so plugin/core panels can be added
later; a thin icon strip shows one icon per *available* panel, and clicking one opens its body. When no
panel is available the rail renders nothing (zero width → composer full).

The first built-in panel is **Table tools** ([TableToolPanel.tsx](src/ui/rail/TableToolPanel.tsx)) —
sort ▲/▼, move/**insert/delete** row & column, **align column L/C/R**, **format** (no-header row,
zebra striping), a per-column **aggregate footer** (Sum/Avg/Count/Min/Max), **transpose**, and
**Export / Copy CSV**. **Insert & delete live *only* on the rail** — the in-grid gutter keeps just the
drag grips, column sort, and the resize handles (it was getting crowded).

**Export CSV** ([core/saveCsv.ts](src/core/saveCsv.ts) `saveCsvFile`) opens a native **Save As** dialog
(name + folder) rather than silently dropping a file in the downloads folder, streams the write through
the Rust `write_text_file` command, shows a **determinate progress bar inside a toast** while writing
(the toast tray at the bottom-right), then resolves that same toast into a self-dismissing
**"'name' exported to 'dir'"** success notification (2 s, with a dismiss ×). The progress bar rides the
extended toast store — `Toast.progress` + `updateToast` in [lib/toast.ts](src/lib/toast.ts). **Copy CSV**
still uses the clipboard.

- **Focus-driven targeting.** The panel can't reach into the CodeMirror widget's local state, so the
  *focused* `EditorTableWidget` **publishes** its dims + active cell + bound action callbacks to a
  module store ([lib/activeTable.ts](src/lib/activeTable.ts), `useActiveTable`); the panel reads them and
  the actions run against the widget's refs. Clicking into a cell sets the target (Advanced-Tables
  behaviour); the panel is available while a table is engaged and the widget `clearActiveTable`s on
  unmount. **Every toolbar button does `onMouseDown → preventDefault`** (the `keepFocus` trick) so the
  click never blurs the editor cell — the target stays put and each edit stays undoable.
- **Transpose** (`transpose` in [core/table.ts](src/core/table.ts)) swaps rows↔columns; since
  dimensions change it **clears `w=`/`h=`/`align`**.
- **Alignment** applies as `text-align` per column in both render modes (`alignToTextAlign`); the panel
  toggles it (click the active alignment again to clear back to default).

### Insert — a rows×cols picker (at the cursor)

[TableSizePicker.tsx](src/ui/editor/TableSizePicker.tsx): a Google-Docs-style hover grid (drag to the
size, click to insert). Reached from the composer toolbar **▦** ([ComposerToolbar.tsx](src/ui/editor/ComposerToolbar.tsx)),
the **+** menu ([AddContentMenu.tsx](src/ui/editor/AddContentMenu.tsx)), the `/table` slash command,
and the editor's right-click **Add table**. Inserts an empty `buildTableBlock(emptyCsv(r, c))` **at
the cursor** (media/embeds insert at the caret now too — see below).

### Import — CSV / XLSX / XLS

The composer's **Document / File** import ([useDocumentUpload.ts](src/hooks/useDocumentUpload.ts))
accepts `csv`/`xlsx`/`xls`. The file is read as CSV first — `.csv` directly; `.xlsx`/`.xls` are
converted (first/active sheet) to CSV via the Rust **`read_table_file`** command
([commands/media.rs](src-tauri/src/commands/media.rs), LibreOffice headless, same converter as
`convert_to_pdf`; BOM-stripped, UTF-8) — then a choice dialog (like the DOCX import) offers:

- **Insert as editable table** — parsed with `parseCsv` and inserted as a ` ```table ` block; the
  option's description shows the size (e.g. *"12 rows × 4 columns"*, with a *"large; may be slow to
  edit"* note past ~50×20). **Every imported row is kept as data under a prepended empty header row**
  — no row is sacrificed to become the header (the blank header can be typed in, or deleted to promote
  the real one).
- **Link as external file** — the "open externally" chip (`external://`), same as a linked DOCX; it
  links the original file (not the converted CSV).

**Import limits:** `.xlsx`/`.xls` need **LibreOffice** (only the first sheet; formulas → values;
formatting/merged-cells/charts/number-formats are lost). Reading assumes **UTF-8 + comma** delimiter.
Very large files produce a large, slow-to-edit table — the dialog warns, and "Link as external file"
is the better path for real datasets.

### Export — [src/core/export.ts](src/core/export.ts)

`toExportMarkdown` replaces each ` ```table ` block with `tableToGfm(parseCsv(csv))`, so an exported
`.md` carries a portable GFM pipe table (renders in Obsidian/GitHub/VS Code). Header colour is dropped
(no GFM equivalent).

---

## Files

| File | Role |
|---|---|
| [core/table.ts](src/core/table.ts) (+ `.test.ts`) | pure CSV/TSV/GFM/meta helpers |
| [core/markdown/remarkJnana.ts](src/core/markdown/remarkJnana.ts) | ` ```table ` → `jnana-table` node |
| [ui/editor/MarkdownLite.tsx](src/ui/editor/MarkdownLite.tsx) | maps `jnana-table` → `TableEmbed` |
| [ui/editor/NoteEmbeds.tsx](src/ui/editor/NoteEmbeds.tsx) | `TableView`, `TableEmbed`, `EditorTableWidget` |
| [ui/editor/TableStickyScrollbar.tsx](src/ui/editor/TableStickyScrollbar.tsx) | floating viewport-bottom horizontal scrollbar |
| [ui/rail/RightRail.tsx](src/ui/rail/RightRail.tsx) + [TableToolPanel.tsx](src/ui/rail/TableToolPanel.tsx) | app-global right toolbar rail + table tools panel |
| [lib/rightRailPanels.ts](src/lib/rightRailPanels.ts) / [lib/activeTable.ts](src/lib/activeTable.ts) | rail panel registry / focused-table bridge |
| [ui/editor/LiveEditor.decorations.tsx](src/ui/editor/LiveEditor.decorations.tsx) | table block-widget `StateField` |
| [ui/editor/LiveEditor.tsx](src/ui/editor/LiveEditor.tsx) | `editTable` / `deleteTable`; slash + context-menu insert |
| [ui/editor/TableSizePicker.tsx](src/ui/editor/TableSizePicker.tsx) | rows×cols insert picker |
| [ui/editor/ComposerToolbar.tsx](src/ui/editor/ComposerToolbar.tsx) / [AddContentMenu.tsx](src/ui/editor/AddContentMenu.tsx) | ▦ / menu insert |
| [ui/settings/ComposerSettingsPanel.tsx](src/ui/settings/ComposerSettingsPanel.tsx) | `tableEditMode` toggle |
| [core/export.ts](src/core/export.ts) | ` ```table ` → GFM on export |

---

## Related changes shipped alongside

- **Single newline → line break in read view.** A dependency-free
  [remarkBreaks.ts](src/core/markdown/remarkBreaks.ts) plugin turns a lone `\n` into `<br>` (matching
  Obsidian/Bear), so "type a line, press Enter, type another" no longer runs the lines together.
  Fenced/inline code stays literal. Applies to **all** notes' read view.
- **Media/embeds insert at the cursor.** The composer toolbar / **+** menu previously appended media
  to the *end* of the note (below a table); it now inserts at the caret, like the right-click import
  (unified in [useComposer.ts](src/hooks/useComposer.ts) callers).

---

## Verification

- `npm test` covers [table.test.ts](src/core/table.test.ts) (parse/serialize, quoting, ragged, TSV,
  GFM, meta round-trip incl. `h=`, `insertRow`/`insertColumn`, `sortRowsByColumn`, the `*MetaAt`
  helpers, `replaceTableBlock`/`deleteTableBlock`, multi-line round-trip) and table rendering + header
  colour + **read-mode sort/filter** in [MarkdownLite.test.tsx](src/ui/editor/MarkdownLite.test.tsx).
- UI (drive in `npm run tauri dev`): insert via ▦ → type across cells (Tab/Enter, Shift+Enter for a
  newline) → click out to persist; insert a row/column *between* two others (⊕); drag a row/column and
  watch the ghost follow; resize a column's right edge and a row's bottom edge; sort a column (▲/▼) then
  Ctrl+Z; paste a range from Excel/Sheets; pick a header colour; delete the table; in read view click a
  header to sort and use ⌕ to filter (then reopen → order/rows unchanged); confirm a wide table scrolls
  in a card and the modal; export → `.md` has a valid GFM table (multi-line cells → `<br>`).

---

## Future ideas / backlog

Deferred, roughly by value-for-effort:

1. **Tab on the last cell adds a new row** — spreadsheet muscle-memory; a few lines in the grid's key
   handler.
2. **A LiveEditor paste that converts a pasted GFM table *outside* a grid into a new ` ```table `
   block** — today the GFM→grid conversion happens only when pasting *into* a table cell.
3. **Whole-table / per-column colour** — extends the header-colour meta.
4. **Persist read-mode sort/filter** — currently the view sort/filter is ephemeral (resets on reload);
   could optionally remember it per-note.
5. **Realign `h=` heights across an edit-mode sort** — today a sort clears row heights rather than
   permuting them.

**Shipped:** drag-to-reorder rows & columns, column-width resize (`w=` meta) and **row-height resize**
(`h=` dense meta, DOM-direct/no-snap), **whole-table corner resize** (proportional scale),
targeted-range-replace commits (structural edits are undoable, no scroll jump), **insert row/column
between existing ones**, a **portaled drag ghost**, **multi-line textarea cells**, **read-mode
view-only sort + filter** (non-destructive) and an **edit-mode column sort** (undoable reorder),
read-mode **horizontal scroll** for wide tables, a **floating sticky horizontal scrollbar** for
tall+wide tables, **per-column alignment** (L/C/R, survives GFM export), **transpose**, **Copy/Export
CSV**, an **app-global right toolbar rail** surfacing the table tools (extensible for future
plugin/core panels), and — Phase 2 — **no-header / zebra / aggregate-footer** formats, a **sticky
header**, **Tab-appends-a-row**, and **GFM-table paste** conversion.

Undo granularity: each **structural** edit is its own undo step (a targeted range replace); a run of
**cell typing** batches into one step (it commits when you leave the table). Fine for note-scale
tables; a finer-grained per-cell writeback is a possible later refinement.
