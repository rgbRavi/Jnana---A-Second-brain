// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import {
  parseCsv,
  serializeCsv,
  parseClipboard,
  tableToGfm,
  replaceTableBlock,
  deleteTableBlock,
  tableBlockRange,
  parseTableMeta,
  serializeTableMeta,
  buildTableBlock,
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
  computeAggregate,
  parseGfmTable,
  TABLE_BLOCK,
  type TableData,
} from './table'

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })

  it('handles quoted cells with commas', () => {
    expect(parseCsv('name,note\nbaseline,"reference run, no tuning"')).toEqual([
      ['name', 'note'],
      ['baseline', 'reference run, no tuning'],
    ])
  })

  it('handles doubled quotes inside a quoted cell', () => {
    expect(parseCsv('a\n"she said ""hi"""')).toEqual([['a'], ['she said "hi"']])
  })

  it('handles newlines inside a quoted cell', () => {
    expect(parseCsv('a,b\n"line1\nline2",x')).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'x'],
    ])
  })

  it('pads ragged rows to the max width', () => {
    expect(parseCsv('a,b,c\n1\n2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', ''],
      ['2', '3', ''],
    ])
  })

  it('folds CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('ignores a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('serializeCsv', () => {
  it('serializes a simple grid', () => {
    expect(serializeCsv([['a', 'b'], ['1', '2']])).toBe('a,b\n1,2')
  })

  it('quotes cells with commas, quotes, or newlines', () => {
    const rows: TableData = [['h'], ['a,b'], ['say "hi"'], ['x\ny']]
    expect(serializeCsv(rows)).toBe('h\n"a,b"\n"say ""hi"""\n"x\ny"')
  })

  it('round-trips through parseCsv', () => {
    const rows: TableData = [
      ['Method', 'Accuracy', 'Notes'],
      ['baseline', '0.71', 'reference run, no tuning'],
      ['ours', '0.86', 'best "so far"'],
    ]
    expect(parseCsv(serializeCsv(rows))).toEqual(rows)
  })
})

describe('parseClipboard', () => {
  it('parses TSV rows and cells', () => {
    expect(parseClipboard('a\tb\tc\n1\t2\t3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('pads ragged TSV and ignores a trailing newline', () => {
    expect(parseClipboard('a\tb\n1\n')).toEqual([
      ['a', 'b'],
      ['1', ''],
    ])
  })

  it('returns [] for empty input', () => {
    expect(parseClipboard('')).toEqual([])
  })
})

describe('tableToGfm', () => {
  it('builds a pipe table with a separator row', () => {
    expect(tableToGfm([['a', 'b'], ['1', '2']])).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
  })

  it('escapes pipes and collapses newlines to <br>', () => {
    expect(tableToGfm([['h'], ['a|b'], ['x\ny']])).toBe('| h |\n| --- |\n| a\\|b |\n| x<br>y |')
  })

  it('returns empty string for an empty grid', () => {
    expect(tableToGfm([])).toBe('')
  })

  it('renders a header-only grid with just header + separator', () => {
    expect(tableToGfm([['a', 'b']])).toBe('| a | b |\n| --- | --- |')
  })

  it('emits column alignment in the separator row', () => {
    expect(tableToGfm([['a', 'b', 'c'], ['1', '2', '3']], 'lcr')).toBe(
      '| a | b | c |\n| :--- | :--: | ---: |\n| 1 | 2 | 3 |',
    )
    // Short/absent codes fall back to the default separator.
    expect(tableToGfm([['a', 'b']], 'c')).toBe('| a | b |\n| :--: | --- |')
  })
})

describe('transpose', () => {
  it('swaps rows and columns (first column becomes the header row)', () => {
    expect(transpose([
      ['Name', 'Score'],
      ['a', '1'],
      ['b', '2'],
    ])).toEqual([
      ['Name', 'a', 'b'],
      ['Score', '1', '2'],
    ])
  })

  it('returns [] for an empty grid and round-trips a square grid', () => {
    expect(transpose([])).toEqual([])
    const g: TableData = [['1', '2'], ['3', '4']]
    expect(transpose(transpose(g))).toEqual(g)
  })
})

describe('alignToTextAlign', () => {
  it('maps codes to CSS text-align', () => {
    expect(alignToTextAlign('c')).toBe('center')
    expect(alignToTextAlign('r')).toBe('right')
    expect(alignToTextAlign('l')).toBeUndefined()
    expect(alignToTextAlign('-')).toBeUndefined()
    expect(alignToTextAlign(undefined)).toBeUndefined()
  })
})

describe('computeAggregate', () => {
  const vals = ['10', '20', '5', '', 'x']
  it('sums / averages / min / max numeric cells, ignoring blanks & non-numbers', () => {
    expect(computeAggregate(vals, 's')).toBe('35')
    expect(computeAggregate(vals, 'a')).toBe('11.667')
    expect(computeAggregate(vals, 'n')).toBe('5')
    expect(computeAggregate(vals, 'x')).toBe('20')
  })
  it('counts non-blank cells and returns empty for no code / no numbers', () => {
    expect(computeAggregate(vals, 'c')).toBe('4')
    expect(computeAggregate(vals, '-')).toBe('')
    expect(computeAggregate(['a', 'b'], 's')).toBe('')
  })
})

describe('parseGfmTable', () => {
  it('parses a pipe table into a grid + alignment', () => {
    const md = '| A | B | C |\n| :--- | :--: | ---: |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |'
    expect(parseGfmTable(md)).toEqual({
      rows: [['A', 'B', 'C'], ['1', '2', '3'], ['4', '5', '6']],
      align: 'lcr',
    })
  })
  it('converts <br> to newlines and unescapes pipes', () => {
    const md = '| H |\n| --- |\n| a<br>b |\n| x\\|y |'
    expect(parseGfmTable(md)).toEqual({ rows: [['H'], ['a\nb'], ['x|y']], align: '-' })
  })
  it('returns null for non-tables (no separator row)', () => {
    expect(parseGfmTable('just text')).toBeNull()
    expect(parseGfmTable('| a | b |\n| c | d |')).toBeNull()
  })
})

describe('TABLE_BLOCK', () => {
  it('captures the info suffix and CSV body of a fenced table block', () => {
    const md = 'intro\n\n```table\na,b\n1,2\n```\n\nafter'
    const matches = [...md.matchAll(TABLE_BLOCK)]
    expect(matches).toHaveLength(1)
    expect(matches[0][1]).toBe('') // no meta
    expect(matches[0][2]).toBe('a,b\n1,2\n')
  })

  it('captures a header-colour meta in the info suffix', () => {
    const md = '```table header=indigo\na,b\n1,2\n```'
    const m = [...md.matchAll(TABLE_BLOCK)][0]
    expect(m[1]).toBe(' header=indigo')
    expect(m[2]).toBe('a,b\n1,2\n')
  })
})

describe('table meta', () => {
  it('parses a header colour from the info suffix', () => {
    expect(parseTableMeta(' header=indigo')).toEqual({ header: 'indigo' })
  })

  it('ignores unknown keys and bare tokens', () => {
    expect(parseTableMeta('foo=bar table junk')).toEqual({})
  })

  it('parses column widths (w=)', () => {
    expect(parseTableMeta('header=rose w=6,10.5,8')).toEqual({ header: 'rose', colWidths: [6, 10.5, 8] })
  })

  it('drops non-positive / non-finite widths', () => {
    expect(parseTableMeta('w=6,0,abc,4')).toEqual({ colWidths: [6, 4] })
  })

  it('serializes and round-trips', () => {
    expect(serializeTableMeta({ header: 'rose' })).toBe('header=rose')
    expect(serializeTableMeta({})).toBe('')
    expect(serializeTableMeta({ header: 'rose', colWidths: [6, 10, 8] })).toBe('header=rose w=6,10,8')
    expect(parseTableMeta(serializeTableMeta({ header: 'rose', colWidths: [6, 10, 8] }))).toEqual({ header: 'rose', colWidths: [6, 10, 8] })
  })

  it('builds a fence block with and without meta', () => {
    expect(buildTableBlock('a,b\n1,2')).toBe('```table\na,b\n1,2\n```')
    expect(buildTableBlock('a,b\n1,2', { header: 'indigo' })).toBe('```table header=indigo\na,b\n1,2\n```')
  })
})

describe('moveRow / moveColumn', () => {
  const grid: TableData = [
    ['h1', 'h2', 'h3'],
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
  ]

  it('moves a row to a new position', () => {
    expect(moveRow(grid, 2, 0)).toEqual([
      ['d', 'e', 'f'],
      ['h1', 'h2', 'h3'],
      ['a', 'b', 'c'],
    ])
  })

  it('moves a column to a new position', () => {
    expect(moveColumn(grid, 0, 2)).toEqual([
      ['h2', 'h3', 'h1'],
      ['b', 'c', 'a'],
      ['e', 'f', 'd'],
    ])
  })

  it('is a no-op for equal or out-of-range indices', () => {
    expect(moveRow(grid, 1, 1)).toBe(grid)
    expect(moveColumn(grid, 0, 9)).toBe(grid)
  })
})

describe('insertRow / insertColumn', () => {
  const grid: TableData = [
    ['h1', 'h2'],
    ['a', 'b'],
    ['c', 'd'],
  ]

  it('inserts a blank row between existing rows', () => {
    expect(insertRow(grid, 1)).toEqual([
      ['h1', 'h2'],
      ['', ''],
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('clamps an out-of-range row index and matches the column count', () => {
    expect(insertRow(grid, 99)).toEqual([
      ['h1', 'h2'],
      ['a', 'b'],
      ['c', 'd'],
      ['', ''],
    ])
    expect(insertRow([], 0)).toEqual([['']])
  })

  it('inserts a blank column between existing columns', () => {
    expect(insertColumn(grid, 1)).toEqual([
      ['h1', '', 'h2'],
      ['a', '', 'b'],
      ['c', '', 'd'],
    ])
  })

  it('clamps an out-of-range column index', () => {
    expect(insertColumn(grid, 99)).toEqual([
      ['h1', 'h2', ''],
      ['a', 'b', ''],
      ['c', 'd', ''],
    ])
  })
})

describe('meta index helpers', () => {
  it('inserts/removes/moves aligned to a non-empty array', () => {
    expect(insertMetaAt([6, 8], 1, 10)).toEqual([6, 10, 8])
    expect(removeMetaAt([6, 8, 10], 1)).toEqual([6, 10])
    expect(moveMetaAt([6, 8, 10], 0, 2)).toEqual([8, 10, 6])
  })

  it('is a no-op on undefined / empty (all-default) arrays', () => {
    expect(insertMetaAt(undefined, 0, 5)).toBeUndefined()
    expect(removeMetaAt([], 0)).toEqual([])
    expect(moveMetaAt(undefined, 0, 1)).toBeUndefined()
  })
})

describe('sortRowsByColumn', () => {
  const grid: TableData = [
    ['Name', 'Score'],
    ['b', '2'],
    ['a', '10'],
    ['c', '1'],
  ]

  it('sorts data rows numerically, keeping the header first', () => {
    expect(sortRowsByColumn(grid, 1, 'asc')).toEqual([
      ['Name', 'Score'],
      ['c', '1'],
      ['b', '2'],
      ['a', '10'],
    ])
  })

  it('sorts descending', () => {
    expect(sortRowsByColumn(grid, 1, 'desc')).toEqual([
      ['Name', 'Score'],
      ['a', '10'],
      ['b', '2'],
      ['c', '1'],
    ])
  })

  it('sorts strings case-insensitively', () => {
    expect(sortRowsByColumn(grid, 0, 'asc').slice(1).map((r) => r[0])).toEqual(['a', 'b', 'c'])
  })

  it('sorts empty cells last regardless of direction', () => {
    const g: TableData = [['h'], ['b'], [''], ['a']]
    expect(sortRowsByColumn(g, 0, 'asc')).toEqual([['h'], ['a'], ['b'], ['']])
    expect(sortRowsByColumn(g, 0, 'desc')).toEqual([['h'], ['b'], ['a'], ['']])
  })

  it('is a no-op for a header-only or single-row grid', () => {
    const g: TableData = [['h'], ['x']]
    expect(sortRowsByColumn(g, 0, 'asc')).toBe(g)
  })
})

describe('rowHeights meta (h=)', () => {
  it('parses a dense row-height array where 0 = auto', () => {
    expect(parseTableMeta('h=2,3.5,2')).toEqual({ rowHeights: [2, 3.5, 2] })
    expect(parseTableMeta('h=0,2,0')).toEqual({ rowHeights: [0, 2, 0] })
  })

  it('round-trips header + widths + heights in a stable order', () => {
    const meta = { header: 'rose', colWidths: [6, 10], rowHeights: [2, 4] }
    expect(serializeTableMeta(meta)).toBe('header=rose w=6,10 h=2,4')
    expect(parseTableMeta(serializeTableMeta(meta))).toEqual(meta)
  })

  it('trims trailing autos (0) on serialize and keeps interior ones', () => {
    expect(serializeTableMeta({ rowHeights: [0, 2, 0, 0] })).toBe('h=0,2')
    expect(parseTableMeta('h=0,2')).toEqual({ rowHeights: [0, 2] })
  })

  it('drops an all-auto or malformed heights array', () => {
    expect(parseTableMeta('h=0,0')).toEqual({})
    expect(parseTableMeta('h=2,0,abc,3')).toEqual({})
    expect(serializeTableMeta({ rowHeights: [0, 0] })).toBe('')
  })
})

describe('align meta', () => {
  it('parses per-column alignment codes', () => {
    expect(parseTableMeta('align=lcr')).toEqual({ align: 'lcr' })
    expect(parseTableMeta('header=rose align=-c-')).toEqual({ header: 'rose', align: '-c-' })
  })

  it('drops an all-default alignment string', () => {
    expect(parseTableMeta('align=---')).toEqual({})
    expect(serializeTableMeta({ align: '---' })).toBe('')
  })

  it('round-trips and trims trailing defaults', () => {
    expect(serializeTableMeta({ align: 'lc--' })).toBe('align=lc')
    expect(parseTableMeta(serializeTableMeta({ align: '-r-' }))).toEqual({ align: '-r' })
  })
})

describe('format meta (noheader / zebra / agg)', () => {
  it('parses bare flags and the aggregate string', () => {
    expect(parseTableMeta('noheader zebra')).toEqual({ noHeader: true, zebra: true })
    expect(parseTableMeta('agg=s-a')).toEqual({ agg: 's-a' })
  })
  it('round-trips together with other options', () => {
    const meta = { header: 'rose', noHeader: true, zebra: true, agg: 'sc' }
    expect(parseTableMeta(serializeTableMeta(meta))).toEqual(meta)
  })
  it('drops an all-default aggregate string', () => {
    expect(parseTableMeta('agg=--')).toEqual({})
    expect(serializeTableMeta({ agg: '--' })).toBe('')
  })
})

describe('multi-line cells', () => {
  it('round-trips a cell containing newlines through a full fence block', () => {
    const rows: TableData = [['Head'], ['line1\nline2\nline3']]
    const block = buildTableBlock(serializeCsv(rows))
    const m = [...block.matchAll(TABLE_BLOCK)][0]
    expect(parseCsv(m[2].replace(/\n$/, ''))).toEqual(rows)
    expect(tableToGfm(rows)).toBe('| Head |\n| --- |\n| line1<br>line2<br>line3 |')
  })
})

describe('replaceTableBlock', () => {
  const md = 'x\n\n```table\na,b\n1,2\n```\n\ny\n\n```table\nc,d\n3,4\n```\n\nz'

  it('replaces only the targeted occurrence', () => {
    const out = replaceTableBlock(md, 1, 'c,d\n9,9')
    expect(out).toContain('```table\na,b\n1,2\n```')
    expect(out).toContain('```table\nc,d\n9,9\n```')
    expect(out).not.toContain('c,d\n3,4')
  })

  it('replaces the first occurrence', () => {
    const out = replaceTableBlock(md, 0, 'a,b\n7,7')
    expect(out).toContain('```table\na,b\n7,7\n```')
    expect(out).toContain('```table\nc,d\n3,4\n```')
  })

  it('leaves content unchanged for an out-of-range occurrence', () => {
    expect(replaceTableBlock(md, 5, 'nope')).toBe(md)
  })

  it('writes a header-colour meta into the fence', () => {
    const out = replaceTableBlock(md, 0, 'a,b\n1,2', { header: 'indigo' })
    expect(out).toContain('```table header=indigo\na,b\n1,2\n```')
  })

  it('replaces a block that already has meta', () => {
    const src = '```table header=rose\na,b\n1,2\n```'
    const out = replaceTableBlock(src, 0, 'a,b\n9,9', { header: 'rose' })
    expect(out).toBe('```table header=rose\na,b\n9,9\n```')
  })
})

describe('deleteTableBlock', () => {
  const md = 'x\n\n```table\na,b\n1,2\n```\n\ny\n\n```table\nc,d\n3,4\n```\n\nz'

  it('removes only the targeted block and closes the gap', () => {
    const out = deleteTableBlock(md, 0)
    expect(out).not.toContain('a,b')
    expect(out).toContain('```table\nc,d\n3,4\n```')
    expect(out).not.toMatch(/\n{3,}/)
  })

  it('removes the second block', () => {
    const out = deleteTableBlock(md, 1)
    expect(out).toContain('```table\na,b\n1,2\n```')
    expect(out).not.toContain('c,d')
  })

  it('leaves content unchanged for an out-of-range occurrence', () => {
    expect(deleteTableBlock(md, 9)).toBe(md)
  })
})

describe('tableBlockRange', () => {
  const md = 'x\n\n```table\na,b\n1,2\n```\n\ny\n\n```table\nc,d\n3,4\n```\n\nz'

  it('returns the char range of the targeted block', () => {
    const r0 = tableBlockRange(md, 0)!
    expect(md.slice(r0.from, r0.to)).toBe('```table\na,b\n1,2\n```')
    const r1 = tableBlockRange(md, 1)!
    expect(md.slice(r1.from, r1.to)).toBe('```table\nc,d\n3,4\n```')
  })

  it('returns null for an out-of-range occurrence', () => {
    expect(tableBlockRange(md, 5)).toBeNull()
  })
})
