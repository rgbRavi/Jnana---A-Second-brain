// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

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

/** Shared body for the colour/highlight wraps — asymmetric markers, so they
 *  can't reuse `wrapInline`. With no selection, drops the caret between the
 *  markers ready to type. */
function wrapColorSpan(text: string, selStart: number, selEnd: number, open: string, close: string): FormatResult {
  const before = text.slice(0, selStart)
  const selected = text.slice(selStart, selEnd)
  const after = text.slice(selEnd)
  const next = `${before}${open}${selected}${close}${after}`
  if (selected) {
    return { text: next, selStart: selStart + open.length, selEnd: selStart + open.length + selected.length }
  }
  const caret = selStart + open.length
  return { text: next, selStart: caret, selEnd: caret }
}

/** Wrap the selection in a text-colour token — `[c:NAME]selected[/c]` (see
 *  core/markdown/colors.ts). */
export function applyColor(text: string, selStart: number, selEnd: number, color: string): FormatResult {
  return wrapColorSpan(text, selStart, selEnd, `[c:${color}]`, '[/c]')
}

/** Wrap the selection in a highlight token — `[h:NAME]selected[/h]`, rendered as
 *  a translucent background wash (see core/markdown/colors.ts). */
export function applyHighlight(text: string, selStart: number, selEnd: number, color: string): FormatResult {
  return wrapColorSpan(text, selStart, selEnd, `[h:${color}]`, '[/h]')
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

// ── Drag-to-rearrange for media embeds ──────────────────────────────────────
// `media_key` = `${url}#${ordinal}` (document-order occurrence per URL) — the
// same identity remarkJnana and the live-editor decoration walk compute, so a
// drag references the exact embed the user grabbed regardless of position.

export type MediaPlacement = 'left' | 'right' | 'above' | 'below'

interface MediaToken {
  from: number
  to: number
  key: string
}

/** Every `![alt](url)` token with its range and stable media_key. */
function scanMediaTokens(text: string): MediaToken[] {
  const re = /!\[[^\]]*\]\(([^)]+)\)/g
  const ordinals = new Map<string, number>()
  const out: MediaToken[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const url = m[1]
    const ord = ordinals.get(url) ?? 0
    ordinals.set(url, ord + 1)
    out.push({ from: m.index, to: m.index + m[0].length, key: `${url}#${ord}` })
  }
  return out
}

/** Document position of the media token whose media_key is `key` (or null). */
export function findMediaTokenPos(text: string, key: string): number | null {
  const tok = scanMediaTokens(text).find((t) => t.key === key)
  return tok ? tok.from : null
}

/**
 * Move the media embed identified by `sourceKey` next to the embed identified
 * by `targetKey`. `left`/`right` place it on the **same markdown line** (a
 * side-by-side row); `above`/`below` place it in its **own blank-line-separated
 * paragraph** (stacked). Both forms render identically in read-mode and the
 * live editor. Pure — returns the whole new document string, or null for a
 * no-op (same token, or either key missing).
 */
export function rearrangeMedia(
  text: string,
  sourceKey: string,
  targetKey: string,
  placement: MediaPlacement,
): string | null {
  if (sourceKey === targetKey) return null
  const tokens = scanMediaTokens(text)
  const src = tokens.find((t) => t.key === sourceKey)
  const tgt = tokens.find((t) => t.key === targetKey)
  if (!src || !tgt) return null
  const srcTok = text.slice(src.from, src.to)

  // Removal range for the source. When it's alone on its line, take the whole
  // line plus one adjacent newline so no blank line is left behind.
  const srcLineStart = text.lastIndexOf('\n', src.from - 1) + 1
  const srcLineEndRaw = text.indexOf('\n', src.to)
  const srcLineEnd = srcLineEndRaw === -1 ? text.length : srcLineEndRaw
  let remFrom = src.from
  let remTo = src.to
  if (text.slice(srcLineStart, srcLineEnd).trim() === srcTok) {
    remFrom = srcLineStart
    remTo = srcLineEnd
    if (text[remTo] === '\n') remTo += 1
    else if (remFrom > 0 && text[remFrom - 1] === '\n') remFrom -= 1
  }

  // Insertion point + text, computed against the original offsets.
  let insPos: number
  let insText: string
  if (placement === 'left') {
    insPos = tgt.from
    insText = srcTok
  } else if (placement === 'right') {
    insPos = tgt.to
    insText = srcTok
  } else if (placement === 'above') {
    insPos = text.lastIndexOf('\n', tgt.from - 1) + 1
    insText = `${srcTok}\n\n`
  } else {
    const tgtLineEndRaw = text.indexOf('\n', tgt.to)
    insPos = tgtLineEndRaw === -1 ? text.length : tgtLineEndRaw
    insText = `\n\n${srcTok}`
  }

  // Apply delete + insert on the original text, highest `from` first so the
  // earlier edit doesn't shift the later one's offsets. On a tie, the deletion
  // (wider range) runs first.
  const edits = [
    { from: remFrom, to: remTo, insert: '' },
    { from: insPos, to: insPos, insert: insText },
  ].sort((a, b) => b.from - a.from || (b.to - b.from) - (a.to - a.from))
  let out = text
  for (const e of edits) out = out.slice(0, e.from) + e.insert + out.slice(e.to)
  // Collapse any 3+ newline run a move can create down to a single blank line,
  // and drop any leading/trailing blank lines the removal left behind (removing
  // a solo media line consumes only one of its two separator newlines).
  return out.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')
}
