// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// @lezer/markdown extension for Jnana's custom note tokens, for the live
// editor's incremental parser. Mirrors remarkJnana.ts's recognition rules —
// both import the same regex sources from tokenPatterns.ts — but is a
// separate parser implementation: lezer (CM6's incremental tree parser) and
// remark/mdast (react-markdown's AST) are different ecosystems with no
// shared parsing code, only shared *patterns*.
//
// Defines two inline node types, `JnanaWikilink` and `JnanaTimestamp`. Nodes
// only carry position (from/to) — LiveEditor.decorations.tsx re-slices the
// source text and re-matches the same anchored regex to recover the title /
// kind / index / time, which is the normal way lezer tree consumers recover
// semantic detail (nodes intentionally carry no extra payload).

import type { MarkdownConfig } from '@lezer/markdown'
import {
  audioTimestampAnchored,
  simpleTimestampAnchored,
  videoTimestampAnchored,
  wikilinkAnchored,
} from './tokenPatterns'

const OPEN_BRACKET = '['.charCodeAt(0)

export const lezerJnana: MarkdownConfig = {
  defineNodes: ['JnanaWikilink', 'JnanaTimestamp'],
  parseInline: [
    {
      name: 'JnanaTokens',
      // Run before the standard Link parser so `[[Title]]`/`[V0::…]` aren't
      // first swallowed (and discarded) as a failed link-reference attempt.
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== OPEN_BRACKET) return -1
        const rest = cx.slice(pos, cx.end)

        const wikilink = wikilinkAnchored().exec(rest)
        if (wikilink && wikilink[1].trim()) {
          return cx.addElement(cx.elt('JnanaWikilink', pos, pos + wikilink[0].length))
        }

        for (const re of [videoTimestampAnchored(), audioTimestampAnchored(), simpleTimestampAnchored()]) {
          const match = re.exec(rest)
          if (match) return cx.addElement(cx.elt('JnanaTimestamp', pos, pos + match[0].length))
        }

        return -1
      },
    },
  ],
}
