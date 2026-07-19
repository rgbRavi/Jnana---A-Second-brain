// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Treat a single newline as a hard line break in read-mode, the way note-takers
// expect (Obsidian/Bear/Notion do this) — plain CommonMark collapses a lone
// `\n` into a space, so "type a line, press Enter, type another" ran the two
// together in the reading view. A soft break lives as a `\n` inside a paragraph
// text node (block parsing already split real paragraphs on blank lines), so we
// just turn each remaining `\n` into an mdast `break` node → <br>.
//
// Dependency-free equivalent of `remark-breaks`. Fenced/inline code are `code`
// nodes (not text), so findAndReplace never visits them — code stays literal.

import { findAndReplace } from 'mdast-util-find-and-replace'
import type { Root } from 'mdast'

export function remarkBreaks() {
  return (tree: Root): void => {
    findAndReplace(tree, [[/\r?\n/g, () => ({ type: 'break' }) as never]])
  }
}
