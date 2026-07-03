// The "live preview" visual layer: a ViewPlugin that walks the syntax tree
// (CommonMark + GFM + lezerJnana) on every doc/selection change and builds a
// DecorationSet that hides markdown markers (showing real bold/italic/
// headings/etc. instead) and replaces media/wikilink/timestamp tokens with
// the same React embed components MarkdownLite uses — unless the selection
// is inside that span, in which case raw markdown is left visible for
// editing (Obsidian/Typora's "reveal near cursor" behavior).
//
// Decorations never touch the document text itself — purely a visual
// overlay, computed fresh each time from the current doc + selection.
//
// Scope note: plain `[text](url)` links are intentionally left undecorated
// in v1 (not part of the reported gap — media/bold/headings/wikilinks were);
// list markers (`-`/`1.`) are left visible too, matching most live-preview
// editors. Both can be added later without touching anything else here.

import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RangeSetBuilder, StateEffect } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import type { Note } from '../../types'
import type { MediaLayout } from '../../core/mediaLayout'
import {
  audioTimestampAnchored,
  simpleTimestampAnchored,
  videoTimestampAnchored,
  wikilinkAnchored,
} from '../../core/markdown/tokenPatterns'
import {
  AudioEmbed,
  ExternalDocLink,
  ImageEmbed,
  PdfEmbed,
  TimestampButton,
  VideoEmbed,
  WikilinkButton,
  YouTubeEmbed,
} from './NoteEmbeds'
import { ResizableMediaFrame } from './ResizableMediaFrame'
import { WebEmbed } from '../WebEmbed'
import styles from './LiveEditor.module.css'

export interface LiveContext {
  notes: Note[]
  noteId: string
  allowNavigate: boolean
  lazy: boolean
  /** Saved media sizes/alignment, keyed by media_key — see core/mediaLayout.ts. */
  mediaLayout: Map<string, MediaLayout>
  /** Swaps the media line identified by `mediaKey` with the adjacent block above/below.
   *  Stable reference (useCallback []) so widget eq() checks don't recreate on re-renders. */
  moveMedia: (mediaKey: string, direction: 'up' | 'down') => void
}

/** Dispatched once `mediaLayout` finishes its (async) load, so decorations
 *  rebuild with the saved sizes even though nothing else about the doc/
 *  selection changed — see LiveEditor.tsx. */
export const forceRebuildMediaLayout = StateEffect.define<void>()

// ── React-mounting widget base ──────────────────────────────────────────
// `eq()` must compare semantic props (not object identity) or CM6 destroys
// and recreates every widget — including video/PDF players — on every
// unrelated keystroke. Concrete widgets just provide props + a render fn.

abstract class ReactWidget<P extends Record<string, unknown>> extends WidgetType {
  private root: Root | null = null
  constructor(protected readonly props: P) {
    super()
  }
  protected abstract renderWidget(): ReactElement

  eq(other: WidgetType): boolean {
    if (other.constructor !== this.constructor) return false
    const a = this.props
    const b = (other as ReactWidget<P>).props
    const keys = Object.keys(a) as (keyof P)[]
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((k) => a[k] === b[k])
  }

  toDOM(): HTMLElement {
    const dom = document.createElement('span')
    this.root = createRoot(dom)
    this.root.render(this.renderWidget())
    return dom
  }

  destroy(): void {
    // Deferred: CM6 can call destroy() while React is mid-render (e.g. the
    // editor view being torn down as part of an ancestor unmount), and
    // synchronously unmounting a root in that window triggers a React
    // warning/race. The dom node is already discarded by CM6 either way.
    const root = this.root
    this.root = null
    queueMicrotask(() => root?.unmount())
  }
}

class VideoWidget extends ReactWidget<{
  url: string
  index: number
  lazy: boolean
  noteId: string
  mediaKey: string
  layout: MediaLayout | undefined
  moveMedia: LiveContext['moveMedia']
}> {
  renderWidget() {
    return (
      <ResizableMediaFrame
        noteId={this.props.noteId}
        mediaKey={this.props.mediaKey}
        layout={this.props.layout}
        onMoveUp={() => this.props.moveMedia(this.props.mediaKey, 'up')}
        onMoveDown={() => this.props.moveMedia(this.props.mediaKey, 'down')}
      >
        {(layout) => <VideoEmbed url={this.props.url} videoIndex={this.props.index} lazy={this.props.lazy} layout={layout} />}
      </ResizableMediaFrame>
    )
  }
}

class AudioWidget extends ReactWidget<{
  url: string
  index: number
  noteId: string
  lazy: boolean
  mediaKey: string
  layout: MediaLayout | undefined
  moveMedia: LiveContext['moveMedia']
}> {
  renderWidget() {
    return (
      <ResizableMediaFrame
        noteId={this.props.noteId}
        mediaKey={this.props.mediaKey}
        layout={this.props.layout}
        onMoveUp={() => this.props.moveMedia(this.props.mediaKey, 'up')}
        onMoveDown={() => this.props.moveMedia(this.props.mediaKey, 'down')}
      >
        {(layout) => (
          <AudioEmbed url={this.props.url} audioIndex={this.props.index} noteId={this.props.noteId} lazy={this.props.lazy} layout={layout} />
        )}
      </ResizableMediaFrame>
    )
  }
}

class YouTubeWidget extends ReactWidget<{
  url: string
  lazy: boolean
  noteId: string
  mediaKey: string
  layout: MediaLayout | undefined
  moveMedia: LiveContext['moveMedia']
}> {
  renderWidget() {
    return (
      <ResizableMediaFrame
        noteId={this.props.noteId}
        mediaKey={this.props.mediaKey}
        layout={this.props.layout}
        onMoveUp={() => this.props.moveMedia(this.props.mediaKey, 'up')}
        onMoveDown={() => this.props.moveMedia(this.props.mediaKey, 'down')}
      >
        {(layout) => <YouTubeEmbed url={this.props.url} lazy={this.props.lazy} layout={layout} />}
      </ResizableMediaFrame>
    )
  }
}

class PdfWidget extends ReactWidget<{ url: string; noteId: string }> {
  renderWidget() {
    return <PdfEmbed url={this.props.url} noteId={this.props.noteId} />
  }
}

class ImageWidget extends ReactWidget<{
  url: string
  alt: string
  lazy: boolean
  noteId: string
  mediaKey: string
  layout: MediaLayout | undefined
  moveMedia: LiveContext['moveMedia']
}> {
  renderWidget() {
    return (
      <ResizableMediaFrame
        noteId={this.props.noteId}
        mediaKey={this.props.mediaKey}
        layout={this.props.layout}
        onMoveUp={() => this.props.moveMedia(this.props.mediaKey, 'up')}
        onMoveDown={() => this.props.moveMedia(this.props.mediaKey, 'down')}
      >
        {(layout) => <ImageEmbed url={this.props.url} altText={this.props.alt} lazy={this.props.lazy} fullscreen={false} layout={layout} />}
      </ResizableMediaFrame>
    )
  }
}

class WebpageWidget extends ReactWidget<{ url: string }> {
  renderWidget() {
    return <WebEmbed url={this.props.url} />
  }
}

class ExternalDocWidget extends ReactWidget<{ name: string; path: string }> {
  renderWidget() {
    return <ExternalDocLink name={this.props.name} path={this.props.path} />
  }
}

class WikilinkWidget extends ReactWidget<{ title: string; notes: Note[]; allowNavigate: boolean }> {
  renderWidget() {
    return <WikilinkButton title={this.props.title} notes={this.props.notes} allowNavigate={this.props.allowNavigate} />
  }
}

class TimestampWidget extends ReactWidget<{
  kind: 'video' | 'audio'
  index: number
  time: string
  onSeek: (kind: 'video' | 'audio', index: number, seconds: number) => void
}> {
  renderWidget() {
    return (
      <TimestampButton kind={this.props.kind} index={this.props.index} time={this.props.time} onSeek={this.props.onSeek} />
    )
  }
}

// ── Decoration building ──────────────────────────────────────────────────

const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: styles.cmHeading1,
  ATXHeading2: styles.cmHeading2,
  ATXHeading3: styles.cmHeading3,
  ATXHeading4: styles.cmHeading4,
  ATXHeading5: styles.cmHeading5,
  ATXHeading6: styles.cmHeading6,
}

function seekInView(view: EditorView, kind: 'video' | 'audio', index: number, seconds: number): void {
  const attr = kind === 'video' ? 'data-video-index' : 'data-audio-index'
  const wrapper = view.dom.querySelector(`[${attr}="${index}"]`) as HTMLElement | null
  if (!wrapper) return
  const media = wrapper.querySelector(kind) as HTMLMediaElement | null
  if (!media) return
  media.currentTime = seconds
  media.play()
  media.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function buildDecorations(view: EditorView, context: LiveContext): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const state = view.state
  const text = state.doc.toString()
  const selection = state.selection

  // Strict overlap — NOT `<=`/`>=` — so a collapsed cursor merely touching a
  // construct's boundary (notably position 0 against a construct that starts
  // the document, which is where a freshly-loaded editor's cursor defaults
  // to) doesn't count as "inside" it. The decision is always made against
  // the *whole* construct's span (`from`/`to`), even though only a narrower
  // sub-range (the marker) actually gets hidden — so clicking anywhere in,
  // say, a heading's text (not just on the `#`) reveals that heading's marker.
  const revealed = (from: number, to: number): boolean =>
    selection.ranges.some((r) => r.from < to && r.to > from)

  let videoIndex = 0
  let audioIndex = 0
  // Mirrors remarkJnana.ts's media_key derivation (url + document-order
  // occurrence ordinal) so both renderers agree on which saved layout
  // applies to which embed.
  const mediaKeyOrdinals = new Map<string, number>()
  const nextMediaKey = (url: string): string => {
    const ordinal = mediaKeyOrdinals.get(url) ?? 0
    mediaKeyOrdinals.set(url, ordinal + 1)
    return `${url}#${ordinal}`
  }

  syntaxTree(state).iterate({
    enter(ref) {
      const { name, from, to } = ref

      const heading = HEADING_CLASS[name]
      if (heading) {
        const node: SyntaxNode = ref.node
        const mark = node.getChild('HeaderMark')
        if (mark) {
          let contentStart = mark.to
          while (text[contentStart] === ' ') contentStart++
          if (!revealed(from, to)) builder.add(mark.from, contentStart, Decoration.replace({}))
          builder.add(contentStart, to, Decoration.mark({ class: heading }))
        }
        return false
      }

      if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough') {
        const node: SyntaxNode = ref.node
        const markName = name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark'
        const marks = node.getChildren(markName)
        if (marks.length === 2) {
          // Ranges must be added to the builder in increasing `from` order —
          // hide-open, then the content mark, then hide-close (not both hides
          // before the content mark, which would add a smaller `from` late).
          const hide = !revealed(from, to)
          if (hide) builder.add(marks[0].from, marks[0].to, Decoration.replace({}))
          const cls = name === 'StrongEmphasis' ? styles.cmStrong : name === 'Emphasis' ? styles.cmEmphasis : styles.cmStrikethrough
          builder.add(marks[0].to, marks[1].from, Decoration.mark({ class: cls }))
          if (hide) builder.add(marks[1].from, marks[1].to, Decoration.replace({}))
        }
        return false
      }

      if (name === 'InlineCode') {
        const node: SyntaxNode = ref.node
        const marks = node.getChildren('CodeMark')
        if (marks.length === 2) {
          const hide = !revealed(from, to)
          if (hide) builder.add(marks[0].from, marks[0].to, Decoration.replace({}))
          builder.add(marks[0].to, marks[1].from, Decoration.mark({ class: styles.cmInlineCode }))
          if (hide) builder.add(marks[1].from, marks[1].to, Decoration.replace({}))
        }
        return false
      }

      if (name === 'Blockquote') {
        const node: SyntaxNode = ref.node
        const mark = node.getChild('QuoteMark')
        if (mark) {
          let contentStart = mark.to
          if (text[contentStart] === ' ') contentStart++
          if (!revealed(from, to)) builder.add(mark.from, contentStart, Decoration.replace({}))
          // Style content only (not the full from..to, which would tie with
          // the hide range's `from` and rely on an unverified tie-break rule).
          builder.add(contentStart, to, Decoration.mark({ class: styles.cmQuote }))
        } else {
          builder.add(from, to, Decoration.mark({ class: styles.cmQuote }))
        }
        return false
      }

      if (name === 'FencedCode') {
        builder.add(from, to, Decoration.mark({ class: styles.cmInlineCode }))
        return false
      }

      if (name === 'Image') {
        const node: SyntaxNode = ref.node
        const marks = node.getChildren('LinkMark')
        const urlNode = node.getChild('URL')
        if (marks.length < 4 || !urlNode) return false
        const alt = text.slice(marks[0].to, marks[1].from)
        const url = text.slice(urlNode.from, urlNode.to)
        // Computed unconditionally (matches remarkJnana.ts incrementing for
        // every image node regardless of alt type) so both renderers agree.
        const mediaKey = nextMediaKey(url)
        const layout = context.mediaLayout.get(mediaKey)

        if (alt === 'video') {
          const idx = videoIndex++
          if (!revealed(from, to)) {
            builder.add(from, to, Decoration.replace({
              widget: new VideoWidget({ url, index: idx, lazy: context.lazy, noteId: context.noteId, mediaKey, layout, moveMedia: context.moveMedia }),
            }))
          }
        } else if (alt === 'audio') {
          const idx = audioIndex++
          if (!revealed(from, to)) {
            builder.add(from, to, Decoration.replace({
              widget: new AudioWidget({ url, index: idx, noteId: context.noteId, lazy: context.lazy, mediaKey, layout, moveMedia: context.moveMedia }),
            }))
          }
        } else if (alt === 'youtube') {
          if (!revealed(from, to)) {
            builder.add(from, to, Decoration.replace({
              widget: new YouTubeWidget({ url, lazy: context.lazy, noteId: context.noteId, mediaKey, layout, moveMedia: context.moveMedia }),
            }))
          }
        } else if (alt === 'pdf') {
          if (!revealed(from, to)) {
            builder.add(from, to, Decoration.replace({ widget: new PdfWidget({ url, noteId: context.noteId }) }))
          }
        } else if (alt === 'webpage') {
          if (!revealed(from, to)) {
            builder.add(from, to, Decoration.replace({ widget: new WebpageWidget({ url }) }))
          }
        } else if (!revealed(from, to)) {
          builder.add(from, to, Decoration.replace({
            widget: new ImageWidget({ url, alt, lazy: context.lazy, noteId: context.noteId, mediaKey, layout, moveMedia: context.moveMedia }),
          }))
        }
        return false
      }

      if (name === 'Link') {
        const node: SyntaxNode = ref.node
        const marks = node.getChildren('LinkMark')
        const urlNode = node.getChild('URL')
        if (marks.length < 4 || !urlNode) return false
        const url = text.slice(urlNode.from, urlNode.to)
        if (url.startsWith('external://') && !revealed(from, to)) {
          const name_ = text.slice(marks[0].to, marks[1].from)
          builder.add(from, to, Decoration.replace({
            widget: new ExternalDocWidget({ name: name_, path: decodeURIComponent(url.replace('external://', '')) }),
          }))
        }
        return false
      }

      if (name === 'JnanaWikilink') {
        if (!revealed(from, to)) {
          const match = wikilinkAnchored().exec(text.slice(from, to))
          const title = match?.[1]?.trim() ?? ''
          builder.add(from, to, Decoration.replace({
            widget: new WikilinkWidget({ title, notes: context.notes, allowNavigate: context.allowNavigate }),
          }))
        }
        return false
      }

      if (name === 'JnanaTimestamp') {
        if (!revealed(from, to)) {
          const raw = text.slice(from, to)
          let kind: 'video' | 'audio' = 'video'
          let index = 0
          let time = ''
          const v = videoTimestampAnchored().exec(raw)
          const a = audioTimestampAnchored().exec(raw)
          const s = simpleTimestampAnchored().exec(raw)
          if (v) {
            kind = 'video'
            index = Number(v[1])
            time = v[2]
          } else if (a) {
            kind = 'audio'
            index = Number(a[1])
            time = a[2]
          } else if (s) {
            kind = 'video'
            index = 0
            time = s[1]
          }
          builder.add(from, to, Decoration.replace({
            widget: new TimestampWidget({ kind, index, time, onSeek: (k, i, sec) => seekInView(view, k, i, sec) }),
          }))
        }
        return false
      }

      return undefined
    },
  })

  return builder.finish()
}

export function liveDecorations(contextRef: { current: LiveContext }) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, contextRef.current)
      }
      update(update: ViewUpdate) {
        const forced = update.transactions.some((tr) => tr.effects.some((e) => e.is(forceRebuildMediaLayout)))
        if (update.docChanged || update.selectionSet || forced) {
          this.decorations = buildDecorations(update.view, contextRef.current)
        }
      }
    },
    { decorations: (v) => v.decorations },
  )
}
