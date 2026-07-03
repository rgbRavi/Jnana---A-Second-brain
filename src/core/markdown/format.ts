// Pure selection-aware markdown formatting for the composer's FormatToolbar.
// Takes the textarea's current text + selection, returns the new text plus
// where the selection should land afterward (so the caret/highlight stays
// sensible instead of jumping to the end). No React, no DOM.

export type FormatKind = 'bold' | 'italic' | 'strike' | 'code' | 'h1' | 'h2' | 'ul' | 'ol' | 'quote' | 'link' | 'codeblock'

export interface FormatResult {
  text: string
  selStart: number
  selEnd: number
}

const INLINE_MARKERS: Record<'bold' | 'italic' | 'strike' | 'code', string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  code: '`',
}

const LINE_PREFIXES: Record<'h1' | 'h2' | 'ul' | 'ol' | 'quote', string> = {
  h1: '# ',
  h2: '## ',
  ul: '- ',
  // Every line uses "1." — CommonMark renumbers an ordered list by position
  // at render time, so this still produces 1./2./3./… once displayed.
  ol: '1. ',
  quote: '> ',
}

/** Wrap the selection in a symmetric inline marker (`**bold**`, `` `code` ``, …). */
function wrapInline(text: string, selStart: number, selEnd: number, marker: string): FormatResult {
  const before = text.slice(0, selStart)
  const selected = text.slice(selStart, selEnd)
  const after = text.slice(selEnd)
  const next = `${before}${marker}${selected}${marker}${after}`
  if (selected) {
    return { text: next, selStart: selStart + marker.length, selEnd: selStart + marker.length + selected.length }
  }
  const caret = selStart + marker.length
  return { text: next, selStart: caret, selEnd: caret }
}

/** Prefix every line touched by the selection (extends to full lines first). */
function prefixLines(text: string, selStart: number, selEnd: number, prefix: string): FormatResult {
  const lineStart = text.lastIndexOf('\n', selStart - 1) + 1
  const nextBreak = text.indexOf('\n', selEnd)
  const lineEnd = nextBreak === -1 ? text.length : nextBreak
  const block = text.slice(lineStart, lineEnd)
  const lines = block.length ? block.split('\n') : ['']
  const prefixed = lines.map((l) => `${prefix}${l}`).join('\n')
  const next = text.slice(0, lineStart) + prefixed + text.slice(lineEnd)
  return {
    text: next,
    selStart: selStart + prefix.length,
    selEnd: selEnd + prefix.length * lines.length,
  }
}

/** Apply one formatting action to `text` given the current selection. Pure — no toggle/un-apply. */
export function applyFormat(text: string, selStart: number, selEnd: number, kind: FormatKind): FormatResult {
  switch (kind) {
    case 'bold':
    case 'italic':
    case 'strike':
    case 'code':
      return wrapInline(text, selStart, selEnd, INLINE_MARKERS[kind])

    case 'h1':
    case 'h2':
    case 'ul':
    case 'ol':
    case 'quote':
      return prefixLines(text, selStart, selEnd, LINE_PREFIXES[kind])

    case 'link': {
      const before = text.slice(0, selStart)
      const selected = text.slice(selStart, selEnd)
      const after = text.slice(selEnd)
      if (selected) {
        const next = `${before}[${selected}](url)${after}`
        const urlStart = selStart + selected.length + 3 // "[" + selected + "]("
        return { text: next, selStart: urlStart, selEnd: urlStart + 3 }
      }
      const next = `${before}[](url)${after}`
      const labelStart = selStart + 1
      return { text: next, selStart: labelStart, selEnd: labelStart }
    }

    case 'codeblock': {
      const before = text.slice(0, selStart)
      const selected = text.slice(selStart, selEnd)
      const after = text.slice(selEnd)
      const next = `${before}\`\`\`\n${selected}\n\`\`\`${after}`
      const innerStart = selStart + 4 // "```\n"
      return selected
        ? { text: next, selStart: innerStart, selEnd: innerStart + selected.length }
        : { text: next, selStart: innerStart, selEnd: innerStart }
    }
  }
}

/** Escape CommonMark/GFM inline-significant characters so pasted text renders
 *  literally instead of being interpreted as markdown syntax (the editor's
 *  "Paste as plain text" — the system clipboard only exposes plain text here,
 *  so escaping is what actually makes it behave differently from a plain paste). */
export function escapeMarkdownText(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+!~|>]/g, '\\$&')
}

/** Locate the paragraph block containing `tokenFrom`, find the block
 *  immediately above (direction='up') or below (direction='down'), and return
 *  a CM6-compatible change record that swaps the two blocks in document order
 *  while preserving the whitespace/blank-lines between them. Returns null when
 *  the block is already at the top or bottom of the document. */
export function moveMediaBlock(
  text: string,
  tokenFrom: number,
  direction: 'up' | 'down',
): { from: number; to: number; insert: string } | null {
  // Build a line table: start/end positions for each line.
  const lines: Array<{ from: number; to: number; text: string }> = []
  let pos = 0
  for (const lineText of text.split('\n')) {
    lines.push({ from: pos, to: pos + lineText.length, text: lineText })
    pos += lineText.length + 1 // +1 for the '\n' separator
  }

  // Find the line containing `tokenFrom`.
  const idx = lines.findIndex((l) => l.from <= tokenFrom && tokenFrom <= l.to)
  if (idx === -1) return null

  // The media token is always a single line — treat just that line as the
  // atomic unit so UP/DOWN works even when text is directly adjacent (no
  // blank line). The adjacent block (where we swap to) still expands to its
  // full paragraph so one press moves past the whole block.
  const blockFrom = lines[idx].from
  const blockTo = lines[idx].to
  const blockText = text.slice(blockFrom, blockTo)

  if (direction === 'up') {
    let prevLast = idx - 1
    while (prevLast >= 0 && lines[prevLast].text.trim() === '') prevLast--
    if (prevLast < 0) return null
    let prevFirst = prevLast
    while (prevFirst > 0 && lines[prevFirst - 1].text.trim() !== '') prevFirst--
    const prevFrom = lines[prevFirst].from
    const prevTo = lines[prevLast].to
    return {
      from: prevFrom,
      to: blockTo,
      insert: blockText + text.slice(prevTo, blockFrom) + text.slice(prevFrom, prevTo),
    }
  } else {
    let nextFirst = idx + 1
    while (nextFirst < lines.length && lines[nextFirst].text.trim() === '') nextFirst++
    if (nextFirst >= lines.length) return null
    let nextLast = nextFirst
    while (nextLast < lines.length - 1 && lines[nextLast + 1].text.trim() !== '') nextLast++
    const nextFrom = lines[nextFirst].from
    const nextTo = lines[nextLast].to
    return {
      from: blockFrom,
      to: nextTo,
      insert: text.slice(nextFrom, nextTo) + text.slice(blockTo, nextFrom) + blockText,
    }
  }
}
