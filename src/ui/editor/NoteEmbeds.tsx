// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Shared embed/token components, rendered identically by the read-mode
// renderer (MarkdownLite.tsx) and the live editor's inline widgets
// (LiveEditor.decorations.tsx) — one home so the two surfaces never drift
// visually. Behavior is otherwise unchanged from the original MarkdownLite.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import type { Note } from '../../types'
import { useInView } from '../../hooks/useInView'
import { useNotesContext } from '../../context/NotesContext'
import { useTranscription } from '../../context/TranscriptionContext'
import { eventBus } from '../../lib/eventBus'
import { showConfirmDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import { saveCsvFile } from '../../core/saveCsv'
import { highlightCode } from '../../core/markdown/highlight'
import { mediaLayoutStyle, type MediaLayout } from '../../core/mediaLayout'
import {
  parseCsv,
  parseClipboard,
  serializeCsv,
  parseTableMeta,
  serializeTableMeta,
  moveRow,
  moveColumn,
  insertRow,
  insertColumn,
  insertMetaAt,
  removeMetaAt,
  moveMetaAt,
  sortRowsByColumn,
  transpose,
  alignToTextAlign,
  parseGfmTable,
  computeAggregate,
  aggregateLabel,
  type TableData,
  type TableMeta,
} from '../../core/table'
import { setActiveTable, clearActiveTable, type ActiveTableActions } from '../../lib/activeTable'
import { COLOR_PALETTE, highlightBackground, resolveColor } from '../../core/markdown/colors'
import { TableStickyScrollbar } from './TableStickyScrollbar'
import { AsyncImage } from '../AsyncImage'
import { AsyncVideo } from '../AsyncVideo'
import { AsyncAudio } from '../AsyncAudio'
import { AsyncYouTube } from '../AsyncYouTube'
import { PdfViewer } from '../media/PdfViewer'
import { PdfThumbnail } from '../media/PdfThumbnail'
import MdStyles from './MarkdownLite.module.css'

function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

export function VideoEmbed({
  url,
  videoIndex,
  lazy,
  layout,
}: {
  url: string
  videoIndex: number
  lazy: boolean
  layout?: MediaLayout
}) {
  const filename = url.replace('jnana-asset://', '')
  return (
    <div
      className={MdStyles.noteVideoWrapper}
      data-video-index={videoIndex}
      style={mediaLayoutStyle(layout)}
      onClick={(e) => e.stopPropagation()}
    >
      <AsyncVideo filename={filename} className={MdStyles.noteVideo} controls preload="metadata" lazy={lazy} />
    </div>
  )
}

export function AudioEmbed({
  url,
  audioIndex,
  noteId,
  lazy,
  layout,
}: {
  url: string
  audioIndex: number
  noteId: string
  lazy: boolean
  layout?: MediaLayout
}) {
  const filename = url.replace('jnana-asset://', '')
  const { notes } = useNotesContext()
  const { jobs, transcribe } = useTranscription()
  const busy = jobs.some((j) => j.filename === filename && j.status === 'running')
  const title = notes.find((n) => n.id === noteId)?.title?.trim() || 'Untitled'

  return (
    <div
      className={MdStyles.noteAudioWrapper}
      data-audio-index={audioIndex}
      style={mediaLayoutStyle(layout)}
      onClick={(e) => e.stopPropagation()}
    >
      <AsyncAudio filename={filename} className={MdStyles.noteAudio} controls preload="metadata" lazy={lazy} />
      {noteId && (
        <button
          className={MdStyles.noteAudioTranscribe}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            transcribe(noteId, title, filename)
          }}
          title="Transcribe this audio to text in the background"
        >
          {busy ? 'Transcribing…' : '📝 Transcribe'}
        </button>
      )}
    </div>
  )
}

export function YouTubeEmbed({ url, lazy, layout }: { url: string; lazy: boolean; layout?: MediaLayout }) {
  const videoId =
    url.match(/[?&]v=([a-zA-Z0-9_-]+)/)?.[1] ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)?.[1]
  if (!videoId) return null
  return (
    <div className={MdStyles.noteYoutubeWrapper} style={mediaLayoutStyle(layout)}>
      <AsyncYouTube videoId={videoId} className={MdStyles.noteYoutube} lazy={lazy} />
    </div>
  )
}

/** Always a small first-page thumbnail (cards and the modal's read view alike
 *  — a full multi-page viewer is too tall for a preview); click opens the
 *  full PdfViewer in a fullscreen overlay. Not part of the resizable-media
 *  layout system — its thumbnail size is intentionally fixed. */
export function PdfEmbed({ url, noteId, lazy = true, layout }: { url: string; noteId: string; lazy?: boolean; layout?: MediaLayout }) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const filename = url.replace('jnana-asset://', '')
  // pdf.js (getDocument + canvas render of page 1) is heavy; don't spin it up
  // for every off-screen card. The thumbnail mounts only once in view.
  const [ref, inView] = useInView<HTMLSpanElement>(lazy)
  return (
    <>
      <span ref={ref} className={MdStyles.notePdfWrapper} style={mediaLayoutStyle(layout)} onClick={(e) => e.stopPropagation()}>
        {inView
          ? <PdfThumbnail filename={filename} width={layout?.width} onClick={() => setIsFullscreen(true)} />
          : <span className={MdStyles.notePdfPlaceholder}>📄 PDF</span>}
      </span>
      {isFullscreen && createPortal(
        <div className={MdStyles.fullscreenOverlay} onClick={() => setIsFullscreen(false)}>
          <div className={MdStyles.fullscreenContent} onClick={(e) => e.stopPropagation()}>
            <button className={MdStyles.fullscreenClose} onClick={() => setIsFullscreen(false)}>✕</button>
            <PdfViewer filename={filename} noteId={noteId} />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

const MAX_TABLE_ROWS = 50
const MAX_TABLE_COLS = 20
const DEFAULT_COL_W = 9 // rem — fixed default so long cells scroll in-cell, not stretch the table
const MIN_COL_W = 1.2 // rem — allow squishing a column right down (text wraps/clips), freedom to resize
const MAX_COL_W = 48
const DEFAULT_ROW_H = 2.4 // rem — height given to a row inserted while heights are in use
const MIN_ROW_H = 1.2
const MAX_ROW_H = 24
/** Keep focus on the current cell when clicking a grid control. */
const keepFocus = (e: ReactMouseEvent) => e.preventDefault()

/** Grow a textarea to fit its content (multi-line cells). */
function autoSizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

/** Pixels per rem, for translating a resize drag delta into rem widths. */
function remPx(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(v) && v > 0 ? v : 16
}
const clampW = (w: number) => Math.min(MAX_COL_W, Math.max(MIN_COL_W, w))
const clampH = (h: number) => Math.min(MAX_ROW_H, Math.max(MIN_ROW_H, h))

/** Translucent header-row background for a saved colour (legible with the
 *  default text colour, theme-safe) — or undefined when unset/invalid. */
function headerCellStyle(header?: string): CSSProperties | undefined {
  if (!header) return undefined
  const resolved = resolveColor(header)
  return resolved ? { backgroundColor: highlightBackground(resolved) } : undefined
}

/** Active read-mode sort: which column and direction. `null` = document order. */
type ViewSort = { col: number; dir: 'asc' | 'desc' } | null

/** Pure read-only render of a grid as an accessible <table>, with an optional
 *  header-row colour, per-column widths, and per-row heights. When `onSort` is
 *  supplied the header cells become sort buttons (used by TableEmbed's view-only
 *  sort). Used in read-mode (cards / peek). */
export function TableView({
  rows,
  header,
  colWidths,
  rowHeights,
  align,
  noHeader,
  zebra,
  agg,
  sort,
  onSort,
}: {
  rows: TableData
  header?: string
  colWidths?: number[]
  rowHeights?: number[]
  align?: string
  noHeader?: boolean
  zebra?: boolean
  agg?: string
  sort?: ViewSort
  onSort?: (col: number) => void
}) {
  if (rows.length === 0) return <span className={MdStyles.noteTableEmpty}>(empty table)</span>
  const hStyle = headerCellStyle(header)
  const hasHeader = !noHeader
  const head = hasHeader ? rows[0] : null
  const body = hasHeader ? rows.slice(1) : rows
  const fixed = !!(colWidths && colWidths.length)
  const rowStyle = (rowIndex: number): CSSProperties | undefined => {
    const h = rowHeights?.[rowIndex]
    return h ? { height: `${h}rem` } : undefined
  }
  const cellStyle = (c: number, base?: CSSProperties): CSSProperties | undefined => {
    const ta = alignToTextAlign(align?.[c])
    return ta ? { ...base, textAlign: ta } : base
  }
  const sortArrow = (c: number) => (sort && sort.col === c ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '')
  const aggActive = !!agg && /[sacnx]/.test(agg)
  const aggCell = (c: number) => {
    const code = agg?.[c]
    return !code || code === '-' ? '' : computeAggregate(body.map((row) => row[c] ?? ''), code)
  }
  return (
    <table className={fixed ? `${MdStyles.noteTable} ${MdStyles.noteTableFixed}` : MdStyles.noteTable}>
      {fixed && (
        <colgroup>
          {rows[0].map((_, c) => <col key={c} style={{ width: `${colWidths![c] ?? DEFAULT_COL_W}rem` }} />)}
        </colgroup>
      )}
      {hasHeader && head && (
        <thead>
          <tr style={rowStyle(0)}>
            {head.map((cell, c) => (
              <th key={c} scope="col" style={cellStyle(c, hStyle)} aria-sort={sort?.col === c ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {onSort ? (
                  <button
                    type="button"
                    className={MdStyles.noteTableSortBtn}
                    onClick={(e) => { e.stopPropagation(); onSort(c) }}
                    title="Sort by this column"
                  >
                    {cell}<span className={MdStyles.noteTableSortArrow}>{sortArrow(c)}</span>
                  </button>
                ) : cell}
              </th>
            ))}
          </tr>
        </thead>
      )}
      {body.length > 0 && (
        <tbody>
          {body.map((row, r) => (
            <tr
              key={r}
              style={rowStyle(hasHeader ? r + 1 : r)}
              className={zebra && r % 2 === 1 ? MdStyles.noteTableZebraRow : undefined}
            >
              {row.map((cell, c) => <td key={c} style={cellStyle(c)}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      )}
      {aggActive && (
        <tfoot>
          <tr>
            {rows[0].map((_, c) => (
              <td key={c} className={MdStyles.noteTableAggFoot} style={cellStyle(c)}>{aggCell(c)}</td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

/** Read-mode render of a ```table block (MarkdownLite): a rendered table with a
 *  **non-destructive** view layer — click a header to sort, or the ⌕ toggle to
 *  filter rows. Neither touches the stored CSV (editing happens inline in the
 *  live editor); this matches NoteModal being a read-focused peek. */
export function TableEmbed({ csv, metaText = '' }: { csv: string; metaText?: string }) {
  const meta = parseTableMeta(metaText)
  const rows = useMemo(() => parseCsv(csv), [csv])
  const [sort, setSort] = useState<ViewSort>(null)
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const scrollRef = useRef<HTMLSpanElement>(null)

  const view = useMemo(() => {
    if (rows.length === 0) return rows
    const q = filter.trim().toLowerCase()
    const match = (row: string[]) => row.some((cell) => cell.toLowerCase().includes(q))
    // No-header tables have no fixed row and no clickable-header sort — just filter.
    if (meta.noHeader) return q ? rows.filter(match) : rows
    const head = rows[0]
    const body = rows.slice(1)
    const filtered = q ? body.filter(match) : body
    const combined = [head, ...filtered]
    return sort ? sortRowsByColumn(combined, sort.col, sort.dir) : combined
  }, [rows, filter, sort, meta.noHeader])

  // Per-row heights only make sense in document order — a view sort/filter
  // reorders/hides rows, so drop them then (cells still wrap, nothing hides).
  const viewActive = !!sort || filter.trim() !== ''
  const cycleSort = (col: number) =>
    setSort((prev) => (!prev || prev.col !== col ? { col, dir: 'asc' } : prev.dir === 'asc' ? { col, dir: 'desc' } : null))

  const hasRows = rows.length > 1
  return (
    <span className={MdStyles.noteTableWrapper} onClick={(e) => e.stopPropagation()}>
      {hasRows && (
        <span className={MdStyles.noteTableTools}>
          <button
            type="button"
            className={showFilter ? `${MdStyles.noteTableToolBtn} ${MdStyles.noteTableToolBtnOn}` : MdStyles.noteTableToolBtn}
            onClick={() => { setShowFilter((v) => !v); if (showFilter) setFilter('') }}
            title="Filter rows"
            aria-label="Filter rows"
          >⌕</button>
          {showFilter && (
            <input
              className={MdStyles.noteTableFilter}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter rows…"
              autoFocus
            />
          )}
          {sort && (
            <button type="button" className={MdStyles.noteTableToolBtn} onClick={() => setSort(null)} title="Clear sort">Clear sort ✕</button>
          )}
        </span>
      )}
      <span ref={scrollRef} className={MdStyles.noteTableScroll}>
        <TableView
          rows={view}
          header={meta.header}
          colWidths={meta.colWidths}
          rowHeights={viewActive ? undefined : meta.rowHeights}
          align={meta.align}
          noHeader={meta.noHeader}
          zebra={meta.zebra}
          agg={meta.agg}
          sort={sort}
          onSort={hasRows && !meta.noHeader ? cycleSort : undefined}
        />
      </span>
      <TableStickyScrollbar scrollRef={scrollRef} />
    </span>
  )
}

/** Ensure at least a 1×1 grid so there's always a cell to edit. */
function seedGrid(rows: TableData): TableData {
  if (rows.length === 0) return [['']]
  const width = Math.max(1, ...rows.map((r) => r.length))
  return rows.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill('')] : r))
}

type TableDrag = { kind: 'row' | 'col'; from: number; to: number }

/**
 * Inline editable grid for the live editor's table widget — edit cells in place,
 * no modal, plus **drag rows/columns to reorder** and **drag a column edge to
 * resize**. To keep the document authoritative *without ever recreating the
 * widget mid-interaction* (which used to jump the scroll on add-row/col), all
 * edits live in local state and sync to the doc (via `onCommit` → a CM6 doc
 * change) only when you leave the table — focus-out, a pointer-down outside it,
 * or unmount. Commits read from refs (always latest) and the editor's writeback
 * is idempotent, so a redundant/late commit is a harmless no-op.
 */
export function EditorTableWidget({
  csv,
  metaText = '',
  onCommit,
  onDelete,
}: {
  csv: string
  metaText?: string
  onCommit: (csv: string, meta: TableMeta) => void
  onDelete: () => void
}) {
  const initial = parseTableMeta(metaText)
  const [rows, setRows] = useState<TableData>(() => seedGrid(parseCsv(csv)))
  const [header, setHeader] = useState<string | undefined>(initial.header)
  const [colWidths, setColWidths] = useState<number[]>(initial.colWidths ?? [])
  const [rowHeights, setRowHeights] = useState<number[]>(initial.rowHeights ?? [])
  const [align, setAlign] = useState<string>(initial.align ?? '')
  const [noHeader, setNoHeader] = useState<boolean>(!!initial.noHeader)
  const [zebra, setZebra] = useState<boolean>(!!initial.zebra)
  const [agg, setAgg] = useState<string>(initial.agg ?? '')
  const [pickingColor, setPickingColor] = useState(false)
  const [drag, setDrag] = useState<TableDrag | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const rowsRef = useRef(rows); rowsRef.current = rows
  const headerRef = useRef(header); headerRef.current = header
  const widthsRef = useRef(colWidths); widthsRef.current = colWidths
  const heightsRef = useRef(rowHeights); heightsRef.current = rowHeights
  const alignRef = useRef(align); alignRef.current = align
  const noHeaderRef = useRef(noHeader); noHeaderRef.current = noHeader
  const zebraRef = useRef(zebra); zebraRef.current = zebra
  const aggRef = useRef(agg); aggRef.current = agg
  // Rail bridge: the focused cell + a stable token identifying this widget.
  const activeCellRef = useRef<{ r: number; c: number } | null>(null)
  const tokenRef = useRef({})
  const dragRef = useRef<TableDrag | null>(null)
  const resizeRef = useRef<{ c: number; startX: number; startW: number; px: number } | null>(null)
  const rowResizeRef = useRef<{ r: number; startY: number; startH: number; px: number; latest: number } | null>(null)
  const tableResizeRef = useRef<{
    startX: number; startY: number
    startWidths: number[]; startHeights: number[]
    startTotalW: number; startTotalH: number
    px: number
    latestW: number[]; latestH: number[]
    movedX: boolean; movedY: boolean
  } | null>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLSpanElement>(null)
  // Once deleted, suppress the flush — re-committing would rewrite whatever
  // block now sits at this occurrence index.
  const deletedRef = useRef(false)

  const commit = useCallback(() => {
    if (deletedRef.current) return
    const w = widthsRef.current
    const h = heightsRef.current
    onCommit(serializeCsv(rowsRef.current), {
      header: headerRef.current,
      colWidths: w.length ? w : undefined,
      rowHeights: h.some((v) => v > 0) ? h : undefined,
      align: /[lcr]/.test(alignRef.current) ? alignRef.current : undefined,
      noHeader: noHeaderRef.current || undefined,
      zebra: zebraRef.current || undefined,
      agg: /[sacnx]/.test(aggRef.current) ? aggRef.current : undefined,
    })
  }, [onCommit])

  // Flush pending edits on unmount (note switch/close before leaving the table).
  useEffect(() => () => commit(), [commit])
  // Release the rail's active-table target when this widget goes away.
  useEffect(() => {
    const tok = tokenRef.current
    return () => clearActiveTable(tok)
  }, [])
  // …and whenever a pointer goes down anywhere outside the table (catches the
  // "clicked away without a focused cell" case that a blur wouldn't).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!deletedRef.current && !wrapRef.current?.contains(e.target as Node | null)) commit()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [commit])

  const handleDelete = async () => {
    if (!(await showConfirmDialog({ title: 'Delete table?', message: 'This removes the whole table from the note.', confirmLabel: 'Delete', danger: true }))) return
    deletedRef.current = true
    onDelete()
  }

  const cols = rows[0]?.length ?? 0
  const atRowCap = rows.length >= MAX_TABLE_ROWS
  const atColCap = cols >= MAX_TABLE_COLS
  const hStyle = headerCellStyle(header)
  const widthOf = (c: number) => colWidths[c] ?? DEFAULT_COL_W

  // Cell typing is local-only (a per-keystroke doc write would recreate the
  // widget and drop focus); it syncs when you leave the table. **Structural**
  // edits (add/delete/reorder/resize/colour) commit right away so each is a
  // normal, undoable CM6 transaction — editTable does a *targeted* range replace,
  // so this no longer jumps the scroll. Refs are updated synchronously first so
  // the commit reads the just-changed grid, not last render's.
  const setCell = (r: number, c: number, value: string) =>
    setRows((prev) => prev.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)))
  const commitRows = (next: TableData) => { rowsRef.current = next; setRows(next); commit(); publish() }
  const setWidths = (w: number[] | undefined) => { if (w) { widthsRef.current = w; setColWidths(w) } }
  const setHeights = (h: number[] | undefined) => { if (h) { heightsRef.current = h; setRowHeights(h) } }
  const setAlignVal = (s: string) => { alignRef.current = s; setAlign(s) }
  // Insert/remove a slot in the per-column alignment string, kept aligned to columns.
  const alignInsertAt = (at: number) => { const a = alignRef.current.split(''); while (a.length < cols) a.push('-'); a.splice(at, 0, '-'); setAlignVal(a.join('')) }
  const alignRemoveAt = (at: number) => { const a = alignRef.current.split(''); if (at < a.length) { a.splice(at, 1); setAlignVal(a.join('')) } }
  const addRow = () => { if (!atRowCap) commitRows([...rowsRef.current, Array(rowsRef.current[0]?.length ?? 1).fill('')]) }
  const addCol = () => { if (!atColCap) commitRows(rowsRef.current.map((row) => [...row, ''])) }
  // Insert *between* existing rows/columns (⊕ on the gutter controls). Keep the
  // width/height meta arrays aligned by inserting a default at the same index.
  // Insert/delete refocus a valid cell afterwards — keeps the CM6 editor focused
  // (so Ctrl+Z undoes the edit) and scrolls the new/neighbouring cell into view
  // (so a column inserted off to the right isn't invisible).
  const insertRowAt = (at: number) => {
    if (rowsRef.current.length >= MAX_TABLE_ROWS) return
    setHeights(insertMetaAt(heightsRef.current, at, 0)) // new row = auto height
    commitRows(insertRow(rowsRef.current, at))
    const c = activeCellRef.current?.c ?? 0
    activeCellRef.current = { r: at, c }
    focusCell(at, c)
  }
  const insertColAt = (at: number) => {
    if ((rowsRef.current[0]?.length ?? 0) >= MAX_TABLE_COLS) return
    setWidths(insertMetaAt(widthsRef.current, at, DEFAULT_COL_W))
    alignInsertAt(at)
    commitRows(insertColumn(rowsRef.current, at))
    const r = activeCellRef.current?.r ?? 0
    activeCellRef.current = { r, c: at }
    focusCell(r, at)
  }
  const deleteRow = (r: number) => {
    if (rowsRef.current.length <= 1) return
    setHeights(removeMetaAt(heightsRef.current, r))
    commitRows(rowsRef.current.filter((_, ri) => ri !== r))
    const nr = Math.min(r, rowsRef.current.length - 1)
    const c = activeCellRef.current?.c ?? 0
    activeCellRef.current = { r: nr, c }
    focusCell(nr, c)
  }
  const deleteCol = (c: number) => {
    if ((rowsRef.current[0]?.length ?? 0) <= 1) return
    setWidths(removeMetaAt(widthsRef.current, c))
    alignRemoveAt(c)
    commitRows(rowsRef.current.map((row) => row.filter((_, ci) => ci !== c)))
    const nc = Math.min(c, (rowsRef.current[0]?.length ?? 1) - 1)
    const r = activeCellRef.current?.r ?? 0
    activeCellRef.current = { r, c: nc }
    focusCell(r, nc)
  }
  // Edit-mode sort: reorders the CSV rows (undoable). Per-row heights don't
  // survive a reorder meaningfully, so drop them.
  const sortByCol = (c: number, dir: 'asc' | 'desc') => {
    if (heightsRef.current.length) { heightsRef.current = []; setRowHeights([]) }
    commitRows(sortRowsByColumn(rowsRef.current, c, dir))
  }
  const pickHeader = (name?: string) => { headerRef.current = name; setHeader(name); setPickingColor(false); commit() }

  // ── Rail bridge: focused-cell actions published to the activeTable store ──
  const focusCell = (r: number, c: number) => {
    requestAnimationFrame(() => wrapRef.current?.querySelector<HTMLTextAreaElement>(`textarea[data-r="${r}"][data-c="${c}"]`)?.focus())
  }
  const moveRowBy = (dir: 'up' | 'down') => {
    const r = activeCellRef.current?.r
    if (r == null) return
    const to = dir === 'up' ? r - 1 : r + 1
    if (to < 0 || to >= rowsRef.current.length) return
    setHeights(moveMetaAt(heightsRef.current, r, to))
    commitRows(moveRow(rowsRef.current, r, to))
    activeCellRef.current = { r: to, c: activeCellRef.current!.c }
    focusCell(to, activeCellRef.current.c)
  }
  const moveColBy = (dir: 'left' | 'right') => {
    const c = activeCellRef.current?.c
    if (c == null) return
    const nc = rowsRef.current[0]?.length ?? 0
    const to = dir === 'left' ? c - 1 : c + 1
    if (to < 0 || to >= nc) return
    setWidths(moveMetaAt(widthsRef.current, c, to))
    const a = alignRef.current.split(''); while (a.length < nc) a.push('-'); const [x] = a.splice(c, 1); a.splice(to, 0, x); setAlignVal(a.join(''))
    commitRows(moveColumn(rowsRef.current, c, to))
    activeCellRef.current = { r: activeCellRef.current!.r, c: to }
    focusCell(activeCellRef.current.r, to)
  }
  const alignColumn = (c: number, code: 'l' | 'c' | 'r') => {
    const nc = rowsRef.current[0]?.length ?? 0
    const a = alignRef.current.split(''); while (a.length < nc) a.push('-')
    a[c] = a[c] === code ? '-' : code // toggle off if already set
    setAlignVal(a.join(''))
    commit(); publish()
  }
  const transposeTable = () => {
    // Dimensions swap → widths/heights/align no longer map; drop them.
    widthsRef.current = []; setColWidths([])
    heightsRef.current = []; setRowHeights([])
    alignRef.current = ''; setAlign('')
    activeCellRef.current = null
    commitRows(transpose(rowsRef.current))
  }
  const exportCsv = () => {
    void saveCsvFile('table.csv', serializeCsv(rowsRef.current))
  }
  const copyCsv = () => {
    void navigator.clipboard.writeText(serializeCsv(rowsRef.current)).then(() => toast('Table copied as CSV'))
  }
  const toggleNoHeader = () => { const v = !noHeaderRef.current; noHeaderRef.current = v; setNoHeader(v); commit(); publish() }
  const toggleZebra = () => { const v = !zebraRef.current; zebraRef.current = v; setZebra(v); commit(); publish() }
  const setAggregate = (c: number, code: 's' | 'a' | 'c' | 'n' | 'x') => {
    const nc = rowsRef.current[0]?.length ?? 0
    const a = aggRef.current.split(''); while (a.length < nc) a.push('-')
    a[c] = a[c] === code ? '-' : code // toggle off if already set
    const s = a.join(''); aggRef.current = s; setAgg(s)
    commit(); publish()
  }
  const publish = () => {
    const actions: ActiveTableActions = {
      sortColumn: (dir) => { const c = activeCellRef.current?.c; if (c != null) sortByCol(c, dir) },
      moveRow: (dir) => moveRowBy(dir),
      moveColumn: (dir) => moveColBy(dir),
      insertRow: (where) => { const r = activeCellRef.current?.r ?? rowsRef.current.length - 1; insertRowAt(where === 'above' ? r : r + 1) },
      insertColumn: (where) => { const c = activeCellRef.current?.c ?? (rowsRef.current[0]?.length ?? 1) - 1; insertColAt(where === 'left' ? c : c + 1) },
      deleteRow: () => { const r = activeCellRef.current?.r; if (r != null) deleteRow(r) },
      deleteColumn: () => { const c = activeCellRef.current?.c; if (c != null) deleteCol(c) },
      transpose: () => transposeTable(),
      alignColumn: (code) => { const c = activeCellRef.current?.c; if (c != null) alignColumn(c, code) },
      toggleNoHeader: () => toggleNoHeader(),
      toggleZebra: () => toggleZebra(),
      setAggregate: (code) => { const c = activeCellRef.current?.c; if (c != null) setAggregate(c, code) },
      exportCsv: () => exportCsv(),
      copyCsv: () => copyCsv(),
    }
    setActiveTable(
      {
        rows: rowsRef.current.length,
        cols: rowsRef.current[0]?.length ?? 0,
        activeCell: activeCellRef.current,
        align: alignRef.current,
        noHeader: noHeaderRef.current,
        zebra: zebraRef.current,
        agg: aggRef.current,
        actions,
      },
      tokenRef.current,
    )
  }

  // Grow every cell to fit its content after any row change (paste/insert/sort/
  // reorder) — the per-keystroke path autosizes inline in onChange.
  useEffect(() => {
    wrapRef.current?.querySelectorAll<HTMLTextAreaElement>('textarea[data-r]').forEach(autoSizeTextarea)
  }, [rows])

  // The widget now updates in place across decoration rebuilds (see ReactWidget.
  // updateDOM), so it keeps its scroll/focus across its own edits. But an
  // *external* doc change (undo/redo, or a programmatic edit) also re-renders us
  // with new csv/meta — reconcile those into local state. Our own commits echo
  // back a csv/meta that already matches local state, so this no-ops for them
  // (which is what preserves the view). Compared in canonical form.
  useEffect(() => {
    const localCsv = serializeCsv(rowsRef.current)
    const localMeta = serializeTableMeta({
      header: headerRef.current,
      colWidths: widthsRef.current.length ? widthsRef.current : undefined,
      rowHeights: heightsRef.current.some((v) => v > 0) ? heightsRef.current : undefined,
      align: /[lcr]/.test(alignRef.current) ? alignRef.current : undefined,
      noHeader: noHeaderRef.current || undefined,
      zebra: zebraRef.current || undefined,
      agg: /[sacnx]/.test(aggRef.current) ? aggRef.current : undefined,
    })
    if (csv === localCsv && serializeTableMeta(parseTableMeta(metaText)) === localMeta) return
    const seeded = seedGrid(parseCsv(csv))
    rowsRef.current = seeded; setRows(seeded)
    const m = parseTableMeta(metaText)
    headerRef.current = m.header; setHeader(m.header)
    widthsRef.current = m.colWidths ?? []; setColWidths(m.colWidths ?? [])
    heightsRef.current = m.rowHeights ?? []; setRowHeights(m.rowHeights ?? [])
    alignRef.current = m.align ?? ''; setAlign(m.align ?? '')
    noHeaderRef.current = !!m.noHeader; setNoHeader(!!m.noHeader)
    zebraRef.current = !!m.zebra; setZebra(!!m.zebra)
    aggRef.current = m.agg ?? ''; setAgg(m.agg ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csv, metaText])

  const handlePaste = (e: ReactClipboardEvent<HTMLTextAreaElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain')
    // Prefer a pasted GFM pipe table (→ grid + alignment); else spreadsheet TSV.
    const gfm = parseGfmTable(text)
    const block = gfm ? gfm.rows : /[\t\n]/.test(text) ? parseClipboard(text) : null
    if (!block || block.length === 0) return
    e.preventDefault()
    // A GFM table pasted at the top-left carries its column alignment too.
    if (gfm && r === 0 && c === 0 && /[lcr]/.test(gfm.align)) setAlignVal(gfm.align)
    const prev = rowsRef.current
    const needRows = Math.min(MAX_TABLE_ROWS, Math.max(prev.length, r + block.length))
    const needCols = Math.min(MAX_TABLE_COLS, Math.max(prev[0]?.length ?? 0, c + Math.max(...block.map((b) => b.length))))
    const next: TableData = Array.from({ length: needRows }, (_, ri) =>
      Array.from({ length: needCols }, (_, ci) => prev[ri]?.[ci] ?? ''),
    )
    block.forEach((brow, bi) => brow.forEach((cell, ci) => {
      if (r + bi < needRows && c + ci < needCols) next[r + bi][c + ci] = cell
    }))
    commitRows(next)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>, r: number, c: number) => {
    // Shift+Enter inserts a literal newline in the cell (multi-line); plain Enter
    // moves down a row, Tab moves between cells.
    if (e.key === 'Enter' && e.shiftKey) return
    if (e.key !== 'Enter' && e.key !== 'Tab') return
    // Tab on the very last cell appends a new row (spreadsheet muscle-memory).
    const lastR = rowsRef.current.length - 1
    const lastC = (rowsRef.current[0]?.length ?? 1) - 1
    if (e.key === 'Tab' && !e.shiftKey && r === lastR && c === lastC) {
      e.preventDefault()
      if (rowsRef.current.length < MAX_TABLE_ROWS) {
        setHeights(insertMetaAt(heightsRef.current, lastR + 1, 0))
        commitRows([...rowsRef.current, Array(rowsRef.current[0]?.length ?? 1).fill('')])
        activeCellRef.current = { r: lastR + 1, c: 0 }
        focusCell(lastR + 1, 0)
      }
      return
    }
    e.preventDefault()
    const nextC = e.key === 'Tab' && !e.shiftKey ? c + 1 : e.key === 'Tab' ? c - 1 : c
    const nextR = e.key === 'Enter' ? r + 1 : r
    wrapRef.current?.querySelector<HTMLTextAreaElement>(`textarea[data-r="${nextR}"][data-c="${nextC}"]`)?.focus()
  }

  const handleBlur = (e: ReactFocusEvent<HTMLSpanElement>) => {
    if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) commit()
  }

  // ── Drag-to-reorder (pointer capture on the grip; hit-test by data attrs) ──
  const indexAtPoint = (kind: 'row' | 'col', x: number, y: number): number | null => {
    const sel = kind === 'col' ? '[data-c],[data-col]' : '[data-r],[data-row]'
    const el = document.elementFromPoint(x, y)?.closest(sel) as HTMLElement | null
    if (!el) return null
    const raw = kind === 'col' ? (el.dataset.c ?? el.dataset.col) : (el.dataset.r ?? el.dataset.row)
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const startDrag = (kind: 'row' | 'col', index: number, e: ReactPointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { kind, from: index, to: index }
    setDrag(dragRef.current)
    setGhost({ x: e.clientX, y: e.clientY })
  }
  const moveDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d) return
    setGhost({ x: e.clientX, y: e.clientY })
    const idx = indexAtPoint(d.kind, e.clientX, e.clientY)
    if (idx != null && idx !== d.to) { dragRef.current = { ...d, to: idx }; setDrag(dragRef.current) }
  }
  const endDrag = () => {
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    setGhost(null)
    if (!d || d.from === d.to) return
    if (d.kind === 'col') {
      setWidths(moveMetaAt(widthsRef.current, d.from, d.to))
      commitRows(moveColumn(rowsRef.current, d.from, d.to))
    } else {
      setHeights(moveMetaAt(heightsRef.current, d.from, d.to))
      commitRows(moveRow(rowsRef.current, d.from, d.to))
    }
  }

  // ── Column resize (pointer capture on the edge handle) ──
  const startResize = (c: number, e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = { c, startX: e.clientX, startW: widthOf(c), px: remPx() }
  }
  const moveResize = (e: ReactPointerEvent) => {
    const rz = resizeRef.current
    if (!rz) return
    const w = clampW(rz.startW + (e.clientX - rz.startX) / rz.px)
    const prev = widthsRef.current
    const arr = prev.length ? [...prev] : Array.from({ length: cols }, (_, i) => prev[i] ?? DEFAULT_COL_W)
    while (arr.length < cols) arr.push(DEFAULT_COL_W)
    arr[rz.c] = Math.round(w * 10) / 10
    widthsRef.current = arr
    setColWidths(arr) // live feedback; committed on pointer-up
  }
  const endResize = () => { if (resizeRef.current) { resizeRef.current = null; commit() } }

  // ── Row resize (pointer capture on the row control's bottom edge) ──
  // Only the dragged row changes; the height is applied straight to that row's
  // textareas via the DOM during the drag (no per-move React re-render → smooth,
  // and no reflow that would yank the handle from the pointer), then committed to
  // state on pointer-up. Other rows stay at 0 (auto), so the table never snaps.
  const applyRowHeightDom = (r: number, hRem: number) => {
    wrapRef.current?.querySelectorAll<HTMLElement>(`textarea[data-r="${r}"]`).forEach((t) => { t.style.minHeight = `${hRem}rem` })
  }
  const startRowResize = (r: number, e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const px = remPx()
    const rowEl = (e.currentTarget as HTMLElement).closest('[data-row]') as HTMLElement | null
    const cur = heightsRef.current[r]
    const startH = cur && cur > 0 ? cur : (rowEl ? rowEl.offsetHeight / px : DEFAULT_ROW_H)
    rowResizeRef.current = { r, startY: e.clientY, startH, px, latest: startH }
  }
  const moveRowResize = (e: ReactPointerEvent) => {
    const rz = rowResizeRef.current
    if (!rz) return
    rz.latest = clampH(rz.startH + (e.clientY - rz.startY) / rz.px)
    applyRowHeightDom(rz.r, rz.latest)
  }
  const endRowResize = () => {
    const rz = rowResizeRef.current
    rowResizeRef.current = null
    if (!rz) return
    const prev = heightsRef.current
    const arr = prev.length ? [...prev] : Array.from({ length: rows.length }, () => 0)
    while (arr.length < rows.length) arr.push(0)
    arr[rz.r] = Math.round(rz.latest * 10) / 10
    heightsRef.current = arr
    setRowHeights(arr)
    commit()
  }

  const heightStyle = (r: number): CSSProperties | undefined =>
    rowHeights[r] > 0 ? { minHeight: `${rowHeights[r]}rem` } : undefined

  const gridTemplateColumns = `auto ${Array.from({ length: cols }, (_, c) => `${widthOf(c)}rem`).join(' ')}`

  // ── Whole-table resize (corner handle) — the horizontal drag scales every
  // column width, the vertical drag scales every row height, and a diagonal drag
  // does both. Each axis only engages once the pointer has moved on it (>3px), so
  // a pure horizontal drag never freezes row heights and vice-versa. Applied
  // straight to the DOM during the drag (smooth), committed on pointer-up. ──
  const gridTemplate = (widths: number[]) => `auto ${widths.map((w) => `${w}rem`).join(' ')}`
  const startTableResize = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const px = remPx()
    const startWidths = Array.from({ length: cols }, (_, c) => widthOf(c))
    const rowEls = wrapRef.current?.querySelectorAll<HTMLElement>('[data-row]')
    const startHeights = Array.from({ length: rows.length }, (_, r) => {
      const cur = heightsRef.current[r]
      if (cur && cur > 0) return cur
      const rEl = rowEls?.[r]
      return rEl ? rEl.offsetHeight / px : DEFAULT_ROW_H
    })
    tableResizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidths,
      startHeights,
      startTotalW: startWidths.reduce((a, b) => a + b, 0) || 1,
      startTotalH: startHeights.reduce((a, b) => a + b, 0) || 1,
      px,
      latestW: startWidths,
      latestH: startHeights,
      movedX: false,
      movedY: false,
    }
  }
  const moveTableResize = (e: ReactPointerEvent) => {
    const tz = tableResizeRef.current
    if (!tz) return
    const pdx = e.clientX - tz.startX
    const pdy = e.clientY - tz.startY
    if (Math.abs(pdx) > 3) tz.movedX = true
    if (Math.abs(pdy) > 3) tz.movedY = true
    if (tz.movedX) {
      const scale = Math.max(0.15, (tz.startTotalW + pdx / tz.px) / tz.startTotalW)
      tz.latestW = tz.startWidths.map((w) => clampW(Math.round(w * scale * 10) / 10))
      if (gridRef.current) gridRef.current.style.gridTemplateColumns = gridTemplate(tz.latestW)
    }
    if (tz.movedY) {
      const scale = Math.max(0.15, (tz.startTotalH + pdy / tz.px) / tz.startTotalH)
      tz.latestH = tz.startHeights.map((h) => clampH(Math.round(h * scale * 10) / 10))
      tz.latestH.forEach((h, r) => applyRowHeightDom(r, h))
    }
  }
  const endTableResize = () => {
    const tz = tableResizeRef.current
    tableResizeRef.current = null
    if (!tz) return
    if (tz.movedX) { widthsRef.current = tz.latestW; setColWidths(tz.latestW) }
    if (tz.movedY) { heightsRef.current = tz.latestH; setRowHeights(tz.latestH) }
    if (tz.movedX || tz.movedY) commit()
  }

  // ── Format helpers (no-header / zebra / aggregate footer) ──
  const isHeaderRow = (r: number) => r === 0 && !noHeader
  const isZebra = (r: number) => { if (!zebra) return false; const di = noHeader ? r : r - 1; return di >= 0 && di % 2 === 1 }
  const aggActive = /[sacnx]/.test(agg)
  const aggFor = (c: number) => {
    const code = agg[c]
    if (!code || code === '-') return ''
    const dataRows = noHeader ? rows : rows.slice(1)
    return computeAggregate(dataRows.map((row) => row[c] ?? ''), code)
  }
  const cellTextAlign = (c: number): CSSProperties => ({ textAlign: alignToTextAlign(align[c]) ?? 'left' })

  return (
    <span ref={wrapRef} className={MdStyles.noteTableEditor} onBlur={handleBlur} onClick={(e) => e.stopPropagation()}>
      <span ref={scrollRef} className={MdStyles.noteTableScroll}>
        <div ref={gridRef} className={MdStyles.noteTableGrid} style={{ gridTemplateColumns }}>
          {/* corner + column controls (row 0 of the grid) */}
          <span className={MdStyles.noteTableCorner} />
          {rows[0]?.map((_, c) => (
            <div
              key={`col-${c}`}
              data-col={c}
              className={drag?.kind === 'col' && drag.to === c ? `${MdStyles.noteTableColCtl} ${MdStyles.noteTableCtlDrop}` : MdStyles.noteTableColCtl}
            >
              <button
                className={MdStyles.noteTableGrip}
                title="Drag to reorder column"
                aria-label={`Reorder column ${c + 1}`}
                onPointerDown={(e) => startDrag('col', c, e)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
              >⋮⋮</button>
              <button className={MdStyles.noteTableSort} onMouseDown={keepFocus} onClick={() => sortByCol(c, 'asc')} title="Sort ascending" aria-label={`Sort column ${c + 1} ascending`}>▲</button>
              <button className={MdStyles.noteTableSort} onMouseDown={keepFocus} onClick={() => sortByCol(c, 'desc')} title="Sort descending" aria-label={`Sort column ${c + 1} descending`}>▼</button>
              <span
                className={MdStyles.noteTableColResize}
                title="Drag to resize column"
                onPointerDown={(e) => startResize(c, e)}
                onPointerMove={moveResize}
                onPointerUp={endResize}
              />
            </div>
          ))}
          {/* data rows: [row control] + cells */}
          {rows.map((row, r) => [
            <div
              key={`rowctl-${r}`}
              data-row={r}
              className={drag?.kind === 'row' && drag.to === r ? `${MdStyles.noteTableRowCtl} ${MdStyles.noteTableCtlDrop}` : MdStyles.noteTableRowCtl}
            >
              <button
                className={MdStyles.noteTableGrip}
                title="Drag to reorder row"
                aria-label={`Reorder row ${r + 1}`}
                onPointerDown={(e) => startDrag('row', r, e)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
              >⋮⋮</button>
              <span
                className={MdStyles.noteTableRowResize}
                title="Drag to resize row"
                onPointerDown={(e) => startRowResize(r, e)}
                onPointerMove={moveRowResize}
                onPointerUp={endRowResize}
              />
            </div>,
            ...row.map((cell, c) => (
              <textarea
                key={`cell-${r}-${c}`}
                data-r={r}
                data-c={c}
                rows={1}
                ref={autoSizeTextarea}
                className={`${MdStyles.noteTableCell}${isHeaderRow(r) ? ' ' + MdStyles.noteTableHeadCell : ''}${isZebra(r) ? ' ' + MdStyles.noteTableZebraCell : ''}`}
                style={{ ...(isHeaderRow(r) ? hStyle : undefined), ...heightStyle(r), textAlign: alignToTextAlign(align[c]) ?? 'left' }}
                value={cell}
                placeholder={isHeaderRow(r) ? 'Header' : ''}
                onFocus={() => { activeCellRef.current = { r, c }; publish() }}
                onChange={(e) => { setCell(r, c, e.target.value); autoSizeTextarea(e.target) }}
                onPaste={(e) => handlePaste(e, r, c)}
                onKeyDown={(e) => handleKeyDown(e, r, c)}
              />
            )),
          ])}
          {aggActive && [
            <div key="aggctl" className={MdStyles.noteTableAggCtl} title="Column totals">Σ</div>,
            ...(rows[0] ?? []).map((_, c) => (
              <div key={`agg-${c}`} className={MdStyles.noteTableAggCell} style={cellTextAlign(c)} title={aggregateLabel(agg[c] ?? '')}>
                {aggFor(c)}
              </div>
            )),
          ]}
          <span
            className={MdStyles.noteTableCornerResize}
            title="Drag to resize the whole table"
            aria-label="Resize table"
            onPointerDown={startTableResize}
            onPointerMove={moveTableResize}
            onPointerUp={endTableResize}
          />
        </div>
      </span>
      <TableStickyScrollbar scrollRef={scrollRef} />
      <div className={MdStyles.noteTableBar}>
        <button className={MdStyles.noteTableBarBtn} onMouseDown={keepFocus} onClick={addRow} disabled={atRowCap}>+ Row</button>
        <button className={MdStyles.noteTableBarBtn} onMouseDown={keepFocus} onClick={addCol} disabled={atColCap}>+ Column</button>
        <span className={MdStyles.noteTableColorWrap}>
          <button className={MdStyles.noteTableBarBtn} onMouseDown={keepFocus} onClick={() => setPickingColor((v) => !v)} title="Header colour">🎨 Header</button>
          {pickingColor && (
            <span className={MdStyles.noteTableSwatches}>
              <button className={MdStyles.noteTableSwatchNone} onMouseDown={keepFocus} onClick={() => pickHeader(undefined)} title="No colour">✕</button>
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.name}
                  className={MdStyles.noteTableSwatch}
                  style={{ background: c.hex }}
                  onMouseDown={keepFocus}
                  onClick={() => pickHeader(c.name)}
                  title={c.label}
                  aria-label={`${c.label} header`}
                />
              ))}
            </span>
          )}
        </span>
        <span className={MdStyles.noteTableBarSpacer} />
        <button
          className={MdStyles.noteTableDeleteBtn}
          onMouseDown={keepFocus}
          onClick={() => void handleDelete()}
          title="Delete table"
        >🗑 Delete</button>
      </div>
      {drag && ghost && createPortal(
        <div className={MdStyles.noteTableDragGhost} style={{ left: ghost.x + 14, top: ghost.y + 6 }}>
          {(drag.kind === 'row' ? (rows[drag.from] ?? []) : rows.map((row) => row[drag.from] ?? '')).map((cell, i) => (
            <span key={i} className={MdStyles.noteTableDragGhostCell}>{cell || '·'}</span>
          ))}
        </div>,
        document.body,
      )}
    </span>
  )
}

export function ImageEmbed({
  url,
  altText,
  lazy,
  fullscreen,
  layout,
}: {
  url: string
  altText: string
  lazy: boolean
  fullscreen: boolean
  layout?: MediaLayout
}) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const handleClick = fullscreen ? (e: React.MouseEvent) => { e.stopPropagation(); setIsFullscreen(true) } : undefined

  const imgEl = url.startsWith('jnana-asset://')
    ? <AsyncImage filename={url.replace('jnana-asset://', '')} alt={altText} className={MdStyles.noteImage} lazy={lazy} />
    : <img src={url} alt={altText} className={MdStyles.noteImage} />

  return (
    <>
      <span
        className={MdStyles.noteImageWrapper}
        onClick={handleClick}
        style={{ ...mediaLayoutStyle(layout), ...(fullscreen ? { cursor: 'zoom-in' } : undefined) }}
      >
        {imgEl}
      </span>
      {isFullscreen && createPortal(
        <div className={MdStyles.fullscreenOverlay} onClick={() => setIsFullscreen(false)}>
          <div className={MdStyles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <button className={MdStyles.fullscreenClose} onClick={() => setIsFullscreen(false)}>✕</button>
            {url.startsWith('jnana-asset://')
              ? <AsyncImage filename={url.replace('jnana-asset://', '')} alt={altText} className={MdStyles.lightboxImage} lazy={false} />
              : <img src={url} alt={altText} className={MdStyles.lightboxImage} />
            }
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export function ExternalDocLink({ name, path }: { name: string; path: string }) {
  const displayName = name.replace(/^External:\s*/i, '')
  return (
    <div className={MdStyles.noteExternalDoc}>
      <span className={MdStyles.noteExternalDocIcon}>📄</span>
      <span className={MdStyles.noteExternalDocName}>{displayName}</span>
      <button
        className={MdStyles.noteExternalDocBtn}
        onClick={() => invoke('open_asset', { path }).catch(console.error)}
      >
        Open
      </button>
    </div>
  )
}

/** Fenced code block. Renders plain styled mono text today; `highlightCode`
 *  is the seam for lazily wiring up a real highlighter later (see core/markdown/highlight.ts). */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void highlightCode(code, lang).then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [code, lang])

  return (
    <pre className={MdStyles.pre}>
      {html ? (
        <code className={MdStyles.code} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <code className={MdStyles.code}>{code}</code>
      )}
    </pre>
  )
}

/** `allowNavigate` gates clicking through to the linked note (confirm dialog
 *  first) — false in contexts where navigating away doesn't make sense, e.g.
 *  an unsaved draft in NoteCreator. */
export function WikilinkButton({ title, notes, allowNavigate }: { title: string; notes: Note[]; allowNavigate: boolean }) {
  const foundNote = notes.find((n) => n.title.toLowerCase() === title.toLowerCase())
  const onClick = !allowNavigate
    ? undefined
    : foundNote
      ? async (e: ReactMouseEvent) => {
          e.stopPropagation()
          if (await showConfirmDialog({ title: 'Open linked note?', message: `Open “${foundNote.title}”?`, confirmLabel: 'Open note' })) {
            eventBus.emit('note:navigate', foundNote)
          }
        }
      : async (e: React.MouseEvent) => {
          // Missing target → offer to materialize the pseudo-note.
          e.stopPropagation()
          const name = title.trim()
          if (!name) return
          if (await showConfirmDialog({ title: 'Create note?', message: `“${name}” doesn’t exist yet. Create it?`, confirmLabel: 'Create note' })) {
            eventBus.emit('wikilink:create', { title: name })
          }
        }
  return (
    <button
      className={foundNote ? MdStyles.wikilinkBtn : MdStyles.wikilinkBtnMissing}
      onClick={onClick}
      style={foundNote && !allowNavigate ? { cursor: 'default' } : undefined}
      title={foundNote ? foundNote.title : allowNavigate ? `Create note: ${title}` : `Note not found: ${title}`}
    >
      {title}
    </button>
  )
}

export function TimestampButton({
  kind,
  index,
  time,
  onSeek,
}: {
  kind: 'video' | 'audio'
  index: number
  time: string
  onSeek: (kind: 'video' | 'audio', index: number, seconds: number) => void
}) {
  return (
    <button
      className={MdStyles.timestampBtn}
      onClick={() => onSeek(kind, index, timeStringToSeconds(time))}
      title={`Seek to ${time}`}
    >
      {time}
    </button>
  )
}
