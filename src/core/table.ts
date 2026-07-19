// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure helpers for the `table` note block — a fenced ```table block holding
// RFC-4180 CSV (first row = header). Plain-text storage keeps tables diff-
// friendly and portable; the inline grid editor (EditorTableWidget) and read-mode
// renderer (TableEmbed) both go through these. No dependencies, fully unit-
// tested — mirrors core/markdown/format.ts.

/** Rows of cells; `row[0]` is the header. Rectangular after `parseCsv`. */
export type TableData = string[][]

/** Presentation options carried in the fence info string (` ```table header=indigo `).
 *  Kept minimal + plain-text; unknown keys are ignored, so it stays portable. */
export interface TableMeta {
  /** Header-row background colour — a palette name or #hex (see core/markdown/colors.ts). */
  header?: string
  /** Per-column widths in rem (index-aligned to columns); omitted/short = default width. */
  colWidths?: number[]
  /** Per-row heights in rem (index-aligned to rows, header = row 0); omitted/short = auto. */
  rowHeights?: number[]
  /** Per-column alignment codes (`l`|`c`|`r`, `-` = default/left), one char per column,
   *  dense to the column count. Survives GFM export (the only presentation option that does). */
  align?: string
  /** Treat the first row as data, not a header (no header styling / `<th>`). */
  noHeader?: boolean
  /** Zebra-stripe the body rows. */
  zebra?: boolean
  /** Per-column aggregate codes for a footer row (`s`um/`a`vg/`c`ount/mi`n`/ma`x`, `-` = none). */
  agg?: string
}

/** Column alignment code (l/c/r/-) → a CSS `text-align` value, or undefined for default. */
export function alignToTextAlign(code: string | undefined): 'center' | 'right' | undefined {
  return code === 'c' ? 'center' : code === 'r' ? 'right' : undefined
}

const roundNum = (n: number) => Math.round(n * 1000) / 1000

/** Compute a single column aggregate over its cell values. Numeric aggregates
 *  ignore blank / non-numeric cells; `count` counts non-blank cells. `''` for none. */
export function computeAggregate(values: string[], code: string): string {
  const nums = values.filter((v) => v.trim() !== '' && Number.isFinite(Number(v))).map(Number)
  switch (code) {
    case 'c': return String(values.filter((v) => v.trim() !== '').length)
    case 's': return nums.length ? String(roundNum(nums.reduce((a, b) => a + b, 0))) : ''
    case 'a': return nums.length ? String(roundNum(nums.reduce((a, b) => a + b, 0) / nums.length)) : ''
    case 'n': return nums.length ? String(Math.min(...nums)) : ''
    case 'x': return nums.length ? String(Math.max(...nums)) : ''
    default: return ''
  }
}

/** Human label for an aggregate code (for the footer's first cell / UI). */
export function aggregateLabel(code: string): string {
  return { s: 'Sum', a: 'Avg', c: 'Count', n: 'Min', x: 'Max' }[code] ?? ''
}

/** Move item at `from` to `to` in a copy of the array (no-op if equal/out of range). */
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Reorder table rows (moves the whole row). Returns a new grid. */
export function moveRow(rows: TableData, from: number, to: number): TableData {
  return moveItem(rows, from, to)
}

/** Reorder table columns (moves the cell at `from`→`to` in every row). */
export function moveColumn(rows: TableData, from: number, to: number): TableData {
  const cols = rows[0]?.length ?? 0
  if (from === to || from < 0 || to < 0 || from >= cols || to >= cols) return rows
  return rows.map((row) => moveItem(row, from, to))
}

/** Insert a blank row at `at` (clamped to [0, len]). Returns a new grid; width
 *  matches the current column count (or 1 for an empty grid). */
export function insertRow(rows: TableData, at: number): TableData {
  const width = rows[0]?.length ?? 1
  const idx = Math.max(0, Math.min(rows.length, at))
  const next = [...rows]
  next.splice(idx, 0, Array(width).fill(''))
  return next
}

/** Insert a blank column at `at` (clamped to [0, cols]) in every row. Returns a new grid. */
export function insertColumn(rows: TableData, at: number): TableData {
  const cols = rows[0]?.length ?? 0
  const idx = Math.max(0, Math.min(cols, at))
  return rows.map((row) => {
    const next = [...row]
    next.splice(idx, 0, '')
    return next
  })
}

/** Insert a value into a per-index metadata array (widths/heights) at `at`,
 *  keeping it index-aligned after an insertRow/insertColumn. No-op on an empty
 *  array (all-default) so we don't materialize defaults unnecessarily. */
export function insertMetaAt(arr: number[] | undefined, at: number, value: number): number[] | undefined {
  if (!arr || arr.length === 0) return arr
  const next = [...arr]
  next.splice(Math.max(0, Math.min(next.length, at)), 0, value)
  return next
}

/** Remove the entry at `at` from a per-index metadata array, keeping it aligned
 *  after a delete. No-op on an empty array. */
export function removeMetaAt(arr: number[] | undefined, at: number): number[] | undefined {
  if (!arr || arr.length === 0) return arr
  return arr.filter((_, i) => i !== at)
}

/** Move the entry at `from`→`to` in a per-index metadata array, keeping it
 *  aligned after a reorder. No-op on an empty array. */
export function moveMetaAt(arr: number[] | undefined, from: number, to: number): number[] | undefined {
  if (!arr || arr.length === 0) return arr
  return moveItem(arr, from, to)
}

/** Directional compare of two non-empty cells: two numbers compare numerically,
 *  otherwise a case-insensitive locale compare. */
function compareCells(a: string, b: string): number {
  const an = Number(a)
  const bn = Number(b)
  if (a.trim() !== '' && b.trim() !== '' && Number.isFinite(an) && Number.isFinite(bn)) return an - bn
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

/** Sort the data rows (everything after the header `row[0]`) by column `col`.
 *  The header stays put; empty cells always sort last regardless of direction.
 *  Stable within equal keys. Returns a new grid. */
export function sortRowsByColumn(rows: TableData, col: number, dir: 'asc' | 'desc'): TableData {
  if (rows.length <= 2) return rows
  const header = rows[0]
  const body = rows.slice(1)
  const sign = dir === 'desc' ? -1 : 1
  const indexed = body.map((row, i) => ({ row, i }))
  indexed.sort((x, y) => {
    const xe = (x.row[col] ?? '').trim() === ''
    const ye = (y.row[col] ?? '').trim() === ''
    if (xe || ye) return xe === ye ? x.i - y.i : xe ? 1 : -1 // empties last, order-preserving
    const c = compareCells(x.row[col] ?? '', y.row[col] ?? '')
    return c !== 0 ? c * sign : x.i - y.i
  })
  return [header, ...indexed.map((e) => e.row)]
}

/** Swap rows ↔ columns. The old first column becomes the new header row. Returns
 *  a new rectangular grid (empty in → empty out). Presentation meta (widths /
 *  heights / align) no longer maps after a transpose and should be dropped. */
export function transpose(rows: TableData): TableData {
  if (rows.length === 0 || rows[0].length === 0) return []
  const cols = rows[0].length
  return Array.from({ length: cols }, (_, c) => rows.map((row) => row[c] ?? ''))
}

/** Matches a whole ```table … ``` fenced block. Group 1 = the info-string suffix
 *  after `table` (e.g. ` header=indigo`, may be empty); group 2 = the CSV body. */
export const TABLE_BLOCK = /```table([^\n]*)\r?\n([\s\S]*?)```/g

/** Parse the fence info suffix (everything after `table`) into a TableMeta. */
export function parseTableMeta(info: string): TableMeta {
  const meta: TableMeta = {}
  for (const tok of info.trim().split(/\s+/)) {
    if (tok === 'noheader') { meta.noHeader = true; continue }
    if (tok === 'zebra') { meta.zebra = true; continue }
    const eq = tok.indexOf('=')
    if (eq <= 0) continue
    const key = tok.slice(0, eq)
    const value = tok.slice(eq + 1)
    if (key === 'header' && value) meta.header = value
    else if (key === 'w' && value) {
      const widths = value.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)
      if (widths.length) meta.colWidths = widths
    } else if (key === 'h' && value) {
      // Dense array aligned to rows; 0 = auto (a resized row keeps others at 0
      // so the array stays index-aligned without forcing every row taller).
      const heights = value.split(',').map(Number)
      if (heights.every((n) => Number.isFinite(n) && n >= 0) && heights.some((n) => n > 0)) meta.rowHeights = heights
    } else if (key === 'align' && value) {
      // Per-column codes l|c|r|- ; keep only if it carries a non-default entry.
      const cleaned = value.replace(/[^lcr-]/g, '')
      if (cleaned && /[lcr]/.test(cleaned)) meta.align = cleaned
    } else if (key === 'agg' && value) {
      const cleaned = value.replace(/[^sacnx-]/g, '')
      if (cleaned && /[sacnx]/.test(cleaned)) meta.agg = cleaned
    }
  }
  return meta
}

/** Serialize a TableMeta back to a fence info suffix (no leading space; '' if empty). */
export function serializeTableMeta(meta: TableMeta): string {
  const parts: string[] = []
  if (meta.header) parts.push(`header=${meta.header}`)
  if (meta.colWidths && meta.colWidths.length) {
    // Trim trailing default-width columns so the token stays compact.
    const w = [...meta.colWidths]
    parts.push(`w=${w.map((n) => Math.round(n * 10) / 10).join(',')}`)
  }
  if (meta.rowHeights && meta.rowHeights.some((n) => n > 0)) {
    const h = [...meta.rowHeights]
    while (h.length && !(h[h.length - 1] > 0)) h.pop() // trim trailing autos (0)
    parts.push(`h=${h.map((n) => Math.round(n * 10) / 10).join(',')}`)
  }
  if (meta.align && /[lcr]/.test(meta.align)) {
    const a = meta.align.replace(/[^lcr-]/g, '').replace(/-+$/, '') // trim trailing defaults
    if (a) parts.push(`align=${a}`)
  }
  if (meta.noHeader) parts.push('noheader')
  if (meta.zebra) parts.push('zebra')
  if (meta.agg && /[sacnx]/.test(meta.agg)) {
    const a = meta.agg.replace(/[^sacnx-]/g, '').replace(/-+$/, '')
    if (a) parts.push(`agg=${a}`)
  }
  return parts.join(' ')
}

/** Assemble a full ```table fenced block from a CSV body + optional meta. */
export function buildTableBlock(csv: string, meta: TableMeta = {}): string {
  const info = serializeTableMeta(meta)
  return '```table' + (info ? ' ' + info : '') + '\n' + csv + '\n```'
}

/** CSV for an empty `rows`×`cols` grid (all blank cells) — for a new table. */
export function emptyCsv(rows: number, cols: number): string {
  const r = Math.max(1, Math.min(50, rows))
  const c = Math.max(1, Math.min(20, cols))
  return Array.from({ length: r }, () => Array(c).fill('').join(',')).join('\n')
}

/** Pad every row out to the widest row's length so the grid is rectangular. */
function padRows(rows: TableData): TableData {
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0)
  return rows.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill('')] : r))
}

/**
 * Parse RFC-4180 CSV into a rectangular grid. Cells may be double-quoted to
 * carry commas, newlines, or quotes (an embedded `"` is doubled `""`). Ragged
 * rows are padded to the max column count. An empty string yields `[]`.
 */
export function parseCsv(text: string): TableData {
  if (text === '') return []
  const rows: TableData = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0

  const pushCell = () => { row.push(cell); cell = '' }
  const pushRow = () => { pushCell(); rows.push(row); row = [] }

  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue } // escaped quote
        quoted = false; i++; continue
      }
      cell += ch; i++; continue
    }
    if (ch === '"') { quoted = true; i++; continue }
    if (ch === ',') { pushCell(); i++; continue }
    if (ch === '\r') { i++; continue } // fold CRLF → LF
    if (ch === '\n') { pushRow(); i++; continue }
    cell += ch; i++
  }
  // Flush the trailing cell/row unless the text ended exactly on a newline.
  if (cell !== '' || row.length > 0) pushRow()

  return padRows(rows)
}

/** True if a cell must be double-quoted for CSV (contains `,`, `"`, or a newline). */
function needsQuote(cell: string): boolean {
  return /[",\r\n]/.test(cell)
}

/** Serialize a grid back to RFC-4180 CSV, quoting only the cells that need it. */
export function serializeCsv(rows: TableData): string {
  return rows
    .map((row) => row.map((c) => (needsQuote(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n')
}

/**
 * Parse clipboard text pasted from a spreadsheet (TSV: tab-separated cells,
 * newline-separated rows) into a rectangular grid. Used by the grid editor's
 * paste handler — the "paste from Excel/Sheets" win.
 */
export function parseClipboard(text: string): TableData {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '')
  if (normalized === '') return []
  return padRows(normalized.split('\n').map((line) => line.split('\t')))
}

/**
 * Detect + parse a pasted **GFM pipe table** (`| a | b |` with a `| --- |`
 * separator row) into a grid + per-column alignment, so pasting a table from a
 * webpage/Obsidian yields an editable grid. Returns null if the text isn't a
 * pipe table. `<br>` in a cell → newline; `\|` → literal pipe.
 */
export function parseGfmTable(text: string): { rows: TableData; align: string } | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  if (lines.length < 2 || !lines.every((l) => l.includes('|'))) return null
  const splitRow = (l: string): string[] => {
    let s = l.trim()
    if (s.startsWith('|')) s = s.slice(1)
    if (s.endsWith('|')) s = s.slice(0, -1)
    return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|').replace(/<br\s*\/?>/gi, '\n'))
  }
  const sep = splitRow(lines[1])
  if (sep.length === 0 || !sep.every((c) => /^:?-+:?$/.test(c))) return null // 2nd line must be the separator
  const align = sep.map((c) => {
    const l = c.startsWith(':')
    const r = c.endsWith(':')
    return l && r ? 'c' : r ? 'r' : l ? 'l' : '-'
  }).join('')
  const rows = padRows([splitRow(lines[0]), ...lines.slice(2).map(splitRow)])
  return { rows, align }
}

/** Escape a cell for a GFM pipe-table body: `|` escaped, newlines → `<br>`. */
function gfmCell(cell: string): string {
  return cell.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

/** GFM separator cell for a column-alignment code (`:---` / `:--:` / `---:`). */
function gfmSep(code: string | undefined): string {
  return code === 'c' ? ':--:' : code === 'r' ? '---:' : code === 'l' ? ':---' : '---'
}

/**
 * Convert a grid to a portable GFM pipe table (header + separator + body), for
 * export to `.md` that renders in Obsidian/GitHub/VS Code. An empty grid yields
 * an empty string; a header-only grid still gets its separator row. `align`
 * (per-column l|c|r|- codes) is emitted in the separator, so column alignment —
 * unlike colour/size — survives the export.
 */
export function tableToGfm(rows: TableData, align?: string): string {
  if (rows.length === 0 || rows[0].length === 0) return ''
  const width = rows[0].length
  const header = rows[0]
  const body = rows.slice(1)
  const line = (cells: string[]) => `| ${cells.map(gfmCell).join(' | ')} |`
  const sep = `| ${Array.from({ length: width }, (_, c) => gfmSep(align?.[c])).join(' | ')} |`
  return [line(header), sep, ...body.map(line)].join('\n')
}

/**
 * Replace the `occurrence`-th (0-based) ```table block, returning the new note
 * content. The edit-writeback primitive: the live-editor grid knows its block's
 * document-order index and rewrites only that one. `meta` sets the fence info
 * suffix (header colour); pass the grid's current meta so a body edit doesn't
 * drop the colour. Out-of-range `occurrence` leaves the content unchanged.
 */
export function replaceTableBlock(content: string, occurrence: number, csv: string, meta: TableMeta = {}): string {
  let i = 0
  return content.replace(TABLE_BLOCK, (match) => (i++ === occurrence ? buildTableBlock(csv, meta) : match))
}

/**
 * Locate the `occurrence`-th (0-based) ```table block's character range in
 * `content` (for a *targeted* CM6 edit — replacing only that range keeps the
 * document's other positions/selection/scroll stable and makes the edit a
 * normal undoable transaction). Returns null if out of range.
 */
export function tableBlockRange(content: string, occurrence: number): { from: number; to: number } | null {
  const re = new RegExp(TABLE_BLOCK.source, 'g') // fresh: don't touch the shared lastIndex
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    if (i++ === occurrence) return { from: m.index, to: m.index + m[0].length }
  }
  return null
}

/**
 * Remove the `occurrence`-th (0-based) ```table block entirely, collapsing the
 * blank-line gap it leaves (3+ newlines → one blank line) so the surrounding
 * text closes up. Out-of-range `occurrence` leaves the content unchanged.
 */
export function deleteTableBlock(content: string, occurrence: number): string {
  let i = 0
  const removed = content.replace(TABLE_BLOCK, (match) => (i++ === occurrence ? '' : match))
  return removed === content ? content : removed.replace(/\n{3,}/g, '\n\n')
}
