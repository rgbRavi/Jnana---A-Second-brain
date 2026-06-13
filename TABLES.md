# Tables — feature spec (Phase C)

## Context & goal

Researchers and note-heavy students need tables, and Jnana has none. The hard part isn't
*rendering* a table — it's *authoring* one (hand-aligning markdown pipes is the misery everyone,
including Obsidian, suffers). So the goal is a pleasant **grid editor** backed by a plain-text,
portable storage format, fitting Jnana's existing block-embed pattern (`![video]`, `![audio]` →
custom components rendered by `MarkdownLite`).

Success = create a table without touching raw syntax, paste a table straight from
Excel/Google Sheets, render it cleanly in a note, edit it later, and export it to portable
markdown.

**Explicitly out of scope** (keep it a *notes* table, not a spreadsheet): formulas, sorting,
filtering, cell formatting, thousands of rows, virtualization. If someone needs that, it's a
`.csv` attachment + a real tool. No heavy data-grid library (bundle is already >500 KB) — the
grid is hand-rolled.

This ships on the **current regex `MarkdownLite` renderer**; it does not require the remark
migration. If/when remark + `remark-gfm` lands, standard pipe tables render for free and the
block detection moves into a remark plugin — the grid editor stays the value-add either way.

---

## Storage format

A fenced block with a `table` info string holding **CSV (RFC 4180-style)**, first row = header:

````
```table
Method,Accuracy,Notes
baseline,0.71,"reference run, no tuning"
ours,0.86,best so far
```
````

- Plain text → diff-friendly, survives in the raw note, portable.
- CSV chosen as the stored format (universally recognized); the parser handles commas-in-cells
  via quoting. **Paste** from spreadsheets is TSV (clipboard), converted to cells on the way in.
- CSV rules: cells separated by `,`, rows by `\n`. A cell containing `,`, `"`, or a newline is
  wrapped in `"`, with embedded `"` doubled (`""`). First row is the header.

---

## Data model + core helpers (`src/core/table.ts`)

```ts
type TableData = string[][]   // rows of cells; row[0] = header. Always rectangular after parse.

parseCsv(text: string): TableData      // RFC4180 quoting; pads ragged rows to max width
serializeCsv(rows: TableData): string  // quotes cells that need it
parseClipboard(text: string): TableData // TSV (\t / \n) → cells, for paste
tableToGfm(rows: TableData): string    // → GFM pipe table (export); escapes `|`, newlines → <br>

// Block detection (used by MarkdownLite + export):
const TABLE_BLOCK = /```table\n([\s\S]*?)```/g
```

Keep these pure + unit-tested (parse/serialize round-trip, quoting, ragged rows, TSV paste,
GFM escaping). No dependency.

---

## Components

### `TableEditor` (modal grid) — `src/ui/editor/TableEditor.tsx`

The shared editor for both create and edit. Props:
```ts
{ initial: TableData;          // empty 2×2 (1 header + 1 row) for create
  onSave: (rows: TableData) => void;
  onClose: () => void }
```
- Renders a grid of `<input>` cells; first row visually marked as header.
- Controls: add row, add column, delete row, delete column, (optional) move row/col.
- **Paste:** on `paste` into a cell, if the clipboard text contains a tab or newline, intercept,
  `parseClipboard` it, and fill cells starting from the focused cell (expanding the grid as
  needed). This is the "paste from Excel" win — the single most important behavior.
- "Save" → `onSave(serialize-ready rows)`; reuse the modal overlay pattern (and the shared
  `<Modal>` from the Phase C modal-extraction item, if done first).

### `TableEmbed` (rendered view) — in `MarkdownLite.tsx`

Renders a parsed table read-only, plus an **Edit** button:
```ts
{ csv: string; noteId: string; occurrence: number }  // occurrence = 0-based index among table blocks
```
- View: `parseCsv(csv)` → `<table>` (first row `<thead>/<th>`, rest `<tbody>/<td>`), wrapped in a
  horizontally scrollable container for wide tables.
- Edit button → opens `TableEditor` prefilled; on save, replace **this** block in the note and
  persist (see "Editing an existing table").

---

## MarkdownLite integration

In `renderContent`, collect `TABLE_BLOCK` matches into the existing `allMatches` array (with
`index`/`endIndex`), alongside image/external matches. Because matches are sorted and spliced by
range — and the overlap guard skips ranges already consumed — the CSV inside a table block is
never re-parsed by the text/timestamp pass. Track a `tableCount++` to assign each `TableEmbed`
its `occurrence` index (document order), mirroring how `videoCount`/`audioCount` work.

---

## Authoring flows

**Create** (no raw editing): `ComposerToolbar` gets a "▦ Table" button that opens `TableEditor`
(empty). On save, `onInsertMarkdown(\`\n\`\`\`table\n${serializeCsv(rows)}\n\`\`\`\n\`)`. The
toolbar owns the modal's open state (same way it owns the YouTube prompt today). Works in all
composers (NoteCreator / NoteItem edit / NoteModal edit) since they all pass `onInsertMarkdown`.

**Edit an existing table** (view mode): `TableEmbed`'s Edit button opens `TableEditor` prefilled.
On save it must replace the right block in the note content:
1. Read the current note content (from `useNotesContext` by `noteId`).
2. Walk `TABLE_BLOCK` matches; replace the `occurrence`-th one with the new serialized block.
3. Persist via `update(noteId, title, newContent)` (the same context path the transcribe button
   already uses to write back to a note). MarkdownLite re-renders from the updated note.

(Optional later: detect a multi-line TSV paste into the *textarea* and offer "convert to table".)

---

## Export (`src/core/export.ts`)

In `toExportMarkdown`, before/after the other rewrites, replace each `TABLE_BLOCK` with
`tableToGfm(parseCsv(...))` so exported `.md` contains a portable GFM pipe table (renders in
Obsidian/GitHub/VS Code). Escape `|` in cells; collapse newlines in cells to `<br>` (GFM tables
can't contain raw newlines).

---

## Edge cases
- Commas / quotes / newlines in cells → CSV quoting (storage) and `<br>`/escaping (GFM export).
- Ragged rows → padded to max column count on parse.
- Empty table / zero data rows → render a small "(empty table)" placeholder, never crash.
- Header-only table → render just the header row.
- Wide tables → `overflow-x: auto` container; no truncation.
- Soft cap (e.g. ~50 rows / ~20 cols) with a gentle note — past that, suggest a CSV attachment.

---

## Build task list
1. `src/core/table.ts` + tests (`table.test.ts`): parse/serialize CSV, parseClipboard (TSV),
   tableToGfm, `TABLE_BLOCK`.
2. `TableEditor.tsx` (+ `.module.css`): grid, add/del row+col, TSV paste.
3. `MarkdownLite.tsx`: detect `TABLE_BLOCK`, `tableCount` occurrence index, render `TableEmbed`
   (table view + Edit → TableEditor → content replace + persist).
4. `ComposerToolbar.tsx`: "▦ Table" button → TableEditor (empty) → insert block. (Prop unchanged:
   reuses `onInsertMarkdown`.)
5. `core/export.ts`: table block → GFM on export.
6. (If the shared `<Modal>` item is done first, build TableEditor on top of it.)

## Verification
- Toolbar → create a 3×3, type cells, save → block appears; reopen note → renders as a table.
- Copy a range from Excel/Sheets → paste into a cell → grid fills correctly.
- Edit an existing table (with two tables in one note) → only the right one changes.
- Cells with commas/quotes round-trip through save → view → edit.
- Export the note → `.md` has a valid GFM pipe table; open it in another viewer.
- `npm test` covers the `core/table.ts` helpers.
