// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Remark plugin for Jnana's custom note tokens, run alongside remark-gfm.
//
// Handles:
//  - Document-order indexing of `![video]` / `![audio]` embeds, so timestamp
//    tokens know which player to seek (`data-video-index` / `data-audio-index`
//    end up on the rendered <img> element's hast properties).
//  - Wikilinks `[[Title]]`, indexed timestamps `[V0::HH:MM:SS]` / `[A0::HH:MM:SS]`,
//    and bare timestamps `[MM:SS]` — turned into custom inline nodes
//    (`data.hName`/`hProperties`) that the `components` map in MarkdownLite
//    renders as buttons.
//
// `findAndReplace` only ever visits literal `text` mdast nodes, so tokens
// inside inline code or fenced code blocks are left untouched for free.

import { visit } from 'unist-util-visit'
import { findAndReplace } from 'mdast-util-find-and-replace'
import type { PhrasingContent, RootContent, Root } from 'mdast'
import { audioTimestampRegex, simpleTimestampRegex, videoTimestampRegex, wikilinkRegex } from './tokenPatterns'
import { colorAnyTokenRegex } from './colors'

/** mdast-util-to-hast's `data.hProperties` convention isn't in `@types/mdast`. */
interface HData {
  hName?: string
  hProperties?: Record<string, unknown>
}

/** Build a custom mdast node that mdast-util-to-hast renders as `<hName ...hProperties>`. */
function customNode(hName: string, hProperties: Record<string, unknown>): PhrasingContent {
  return { type: hName, data: { hName, hProperties } } as unknown as PhrasingContent
}

export function remarkJnana() {
  return (tree: Root): void => {
    let videoIndex = 0
    let audioIndex = 0
    const mediaKeyOrdinals = new Map<string, number>()

    // Media indexing — must run before the text-token pass below makes no
    // difference here since images aren't text nodes, but keep it first for
    // readability (it establishes the indices timestamp tokens reference).
    //
    // Every media node also gets a stable `data-media-key` (url + document-
    // order occurrence ordinal) so duplicate embeds of the same file get
    // independent layout in note_media_layout — the CM6 decoration walk
    // (LiveEditor.decorations.tsx) computes the same key the same way, so
    // both renderers agree on which saved size/alignment applies to which embed.
    visit(tree, 'image', (node) => {
      const data = (node.data ?? {}) as HData
      const url = node.url ?? ''
      const ordinal = mediaKeyOrdinals.get(url) ?? 0
      mediaKeyOrdinals.set(url, ordinal + 1)
      const hProperties: Record<string, unknown> = { ...data.hProperties, 'data-media-key': `${url}#${ordinal}` }
      if (node.alt === 'video') hProperties['data-video-index'] = videoIndex++
      else if (node.alt === 'audio') hProperties['data-audio-index'] = audioIndex++
      node.data = { ...data, hProperties } as typeof node.data
    })

    // ```table fenced blocks → a custom block node the `components` map renders
    // as a <TableEmbed>. The fence parses as a `code` node with lang 'table';
    // we swap it for a `jnana-table` node carrying the raw CSV plus a document-
    // order `occurrence` index (same parse-time indexing idea as the media
    // indices above) so the read-view Edit button can write back the right
    // block. Changing the node's `type` away from `code` is required — that's
    // what makes mdast-util-to-hast use its `data.hName` fallback instead of the
    // built-in code handler (the inline `customNode` above relies on the same
    // trick). remark-gfm pipe tables are untouched; only lang 'table' fences are
    // intercepted, so ordinary fenced code still flows to `pre`/`CodeBlock`.
    let tableIndex = 0
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'table' || !parent || index == null) return
      // mdast splits the info string: `lang` is the first word ('table'), `meta`
      // is the rest ('header=indigo w=6,8') — the table's presentation options,
      // carried raw for the renderer (MarkdownLite/TableEmbed) to parse.
      const hProperties: Record<string, unknown> = { csv: node.value, occurrence: tableIndex++, meta: node.meta ?? '' }
      const block: RootContent = {
        type: 'jnana-table',
        data: { hName: 'jnana-table', hProperties },
      } as unknown as RootContent
      parent.children[index] = block
    })

    // Order matters: findAndReplace runs one full tree pass per pattern, in
    // list order. Wikilinks must come before the bare-timestamp pattern, or
    // the `00:05` inside `[[00:05]]` would be claimed by the generic pattern
    // first (mirrors the old renderer's leftmost-match-wins behavior).
    findAndReplace(tree, [
      // Colour/highlight first so their `[c:…]…[/c]` / `[h:…]…[/h]` markers are
      // consumed before the other bracket patterns can nibble at them. A single
      // combined pattern matches the OUTERMOST span (see colorAnyTokenRegex), so
      // one token nested in the other survives as raw `data-text` — the renderer
      // (MarkdownLite `renderColorTokens`) re-parses that inner run so the nested
      // token becomes a nested span. Markdown inside is otherwise plain text (as
      // with the other leaf tokens); an empty inner run is dropped.
      [
        colorAnyTokenRegex(),
        (_match: string, kind: string, color: string, inner: string) =>
          inner
            ? customNode(kind === 'h' ? 'jnana-highlight' : 'jnana-color', { 'data-color': color, 'data-text': inner })
            : false,
      ],
      [
        wikilinkRegex(),
        (_match: string, title: string) => {
          const trimmed = title.trim()
          return trimmed ? customNode('jnana-wikilink', { title: trimmed }) : false
        },
      ],
      [
        videoTimestampRegex(),
        (_match: string, index: string, time: string) =>
          customNode('jnana-timestamp', { kind: 'video', index: Number(index), time }),
      ],
      [
        audioTimestampRegex(),
        (_match: string, index: string, time: string) =>
          customNode('jnana-timestamp', { kind: 'audio', index: Number(index), time }),
      ],
      [
        simpleTimestampRegex(),
        (_match: string, time: string) => customNode('jnana-timestamp', { kind: 'video', index: 0, time }),
      ],
    ])
  }
}
