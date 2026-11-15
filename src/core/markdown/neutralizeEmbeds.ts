// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/markdown/neutralizeEmbeds.ts
//
// Markdown from an untrusted author (assistant chat text, web-run proposals) must not load
// anything on render: `![webpage](url)` makes Rust GET the url, so injected page text could
// exfiltrate data with zero clicks. Every image form (`![…](…)`, `![…][ref]`, `![…]`, inside
// footnotes/tables/links) becomes a plain link by escaping its `!`. Parsed with the same
// remark + gfm stack MarkdownLite renders with, so what counts as an image here matches the
// renderer. Local `jnana-asset://` media stays (except as a webpage embed). Notes the user
// writes never go through this.

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'

const parser = unified().use(remarkParse).use(remarkGfm)
const LOCAL = /^jnana-asset:\/\//i

/** Offsets of the `!` of every image the renderer would load, last first. */
function embedStarts(md: string): number[] {
  const at: number[] = []
  visit(parser.parse(md) as Root, (node) => {
    if (node.type !== 'image' && node.type !== 'imageReference') return
    if (node.type === 'image' && LOCAL.test(node.url) && node.alt !== 'webpage') return
    const offset = node.position?.start.offset
    if (offset != null && md[offset] === '!') at.push(offset)
  })
  return at.sort((a, b) => b - a)
}

export function neutralizeEmbeds(md: string): string {
  if (!md.includes('![')) return md
  // Escaping a `!` can't create a new image, but re-check rather than trust that.
  for (let pass = 0; pass < 3; pass++) {
    const starts = embedStarts(md)
    if (!starts.length) return md
    for (const i of starts) md = `${md.slice(0, i)}\\${md.slice(i)}`
  }
  // Last resort: a character reference is never syntax, so no `!` can start an image.
  return embedStarts(md).length ? md.replace(/!/g, '&#33;') : md
}
