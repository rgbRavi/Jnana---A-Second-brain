import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import type { Element as HastElement } from 'hast'
import { useNotesContext } from '../../context/NotesContext'
import { remarkJnana } from '../../core/markdown/remarkJnana'
import { getMediaLayout, alignmentTextAlign, type MediaLayout } from '../../core/mediaLayout'
import {
  AudioEmbed,
  CodeBlock,
  ExternalDocLink,
  ImageEmbed,
  PdfEmbed,
  TimestampButton,
  VideoEmbed,
  WikilinkButton,
  YouTubeEmbed,
} from './NoteEmbeds'
import { WebEmbed } from '../WebEmbed'
import MdStyles from './MarkdownLite.module.css'

interface Props {
  content: string
  noteId?: string
  lazy?: boolean
  /** Enables fullscreen expand for PDF and image embeds (use in modal context) */
  fullscreen?: boolean
}

const REMARK_PLUGINS = [remarkGfm, remarkJnana]

/** Allow the app's custom asset/external schemes through; everything else
 *  (http/https/mailto/…) still goes through react-markdown's own sanitizer. */
function jnanaUrlTransform(url: string): string {
  return /^(jnana-asset|external):/i.test(url) ? url : defaultUrlTransform(url)
}

function hastProperties(node: HastElement | undefined): Record<string, unknown> {
  return (node?.properties ?? {}) as Record<string, unknown>
}

export function MarkdownLite({ content, noteId = '', lazy = true, fullscreen = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { notes } = useNotesContext()
  // Read via ref, not directly in the `components` memo's deps below: NotesContext's
  // value object is recreated on every note save app-wide, so any component that
  // reads `notes` straight from context re-renders on every save regardless of
  // memo (React doesn't let memo block a direct context consumer). Keeping `notes`
  // out of the memo's deps means `components`' identity — and so whether
  // react-markdown below has to re-parse — depends only on this card's own props,
  // not on unrelated notes being saved elsewhere. Wikilink found/missing status
  // still reads the latest list whenever this card legitimately re-renders.
  const notesRef = useRef(notes)
  notesRef.current = notes

  // Saved media sizes/alignment — loaded once per note (resize affordances
  // only exist in the live editor, so this never needs to update mid-view).
  const [layoutMap, setLayoutMap] = useState<Map<string, MediaLayout>>(new Map())
  useEffect(() => {
    if (!noteId) return
    let active = true
    getMediaLayout(noteId)
      .then((map) => { if (active) setLayoutMap(map) })
      .catch(() => {})
    return () => { active = false }
  }, [noteId])

  const seek = (kind: 'video' | 'audio', index: number, seconds: number) => {
    if (!containerRef.current) return
    const attr = kind === 'video' ? 'data-video-index' : 'data-audio-index'
    const wrapper = containerRef.current.querySelector(`[${attr}="${index}"]`) as HTMLElement | null
    if (!wrapper) return
    const media = wrapper.querySelector(kind) as HTMLMediaElement | null
    if (!media) return
    media.currentTime = seconds
    media.play()
    media.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const components = useMemo(() => {
    const img: Components['img'] = ({ alt, src, node }) => {
      const url = src ?? ''
      const mediaKey = String(hastProperties(node)['data-media-key'] ?? '')
      const layout = layoutMap.get(mediaKey)
      if (alt === 'video') {
        const idx = Number(hastProperties(node)['data-video-index'] ?? 0)
        return <VideoEmbed url={url} videoIndex={idx} lazy={lazy} layout={layout} />
      }
      if (alt === 'audio') {
        const idx = Number(hastProperties(node)['data-audio-index'] ?? 0)
        return <AudioEmbed url={url} audioIndex={idx} noteId={noteId} lazy={lazy} layout={layout} />
      }
      if (alt === 'youtube') return <YouTubeEmbed url={url} lazy={lazy} layout={layout} />
      if (alt === 'pdf') return <PdfEmbed url={url} noteId={noteId} />
      if (alt === 'webpage') return <WebEmbed url={url} />
      return <ImageEmbed url={url} altText={alt ?? ''} lazy={lazy} fullscreen={fullscreen} layout={layout} />
    }

    // Justify a paragraph when its media has a saved alignment — the read-mode
    // counterpart to the live editor's per-line text-align. Embeds are
    // inline-block (mediaLayoutStyle), so this shifts the whole row without
    // breaking a side-by-side arrangement.
    const p: Components['p'] = ({ node, children }) => {
      let textAlign: ReturnType<typeof alignmentTextAlign>
      for (const child of node?.children ?? []) {
        if (child.type === 'element' && child.tagName === 'img') {
          const key = String((child.properties ?? {})['data-media-key'] ?? '')
          const aligned = alignmentTextAlign(layoutMap.get(key)?.alignment)
          if (aligned) { textAlign = aligned; break }
        }
      }
      return <p style={textAlign ? { textAlign } : undefined}>{children}</p>
    }

    const a: Components['a'] = ({ href = '', children }) => {
      if (href.startsWith('external://')) {
        const name = typeof children === 'string' ? children : String(children ?? '')
        return <ExternalDocLink name={name} path={decodeURIComponent(href.replace('external://', ''))} />
      }
      return (
        <a
          href={href}
          className={MdStyles.link}
          onClick={(e) => {
            e.preventDefault()
            void openUrl(href)
          }}
        >
          {children}
        </a>
      )
    }

    const pre: Components['pre'] = (props) => {
      const codeNode = props.node?.children?.[0]
      if (codeNode?.type === 'element' && codeNode.tagName === 'code') {
        const classNames = codeNode.properties?.className
        const langClass = Array.isArray(classNames)
          ? classNames.find((c): c is string => typeof c === 'string' && c.startsWith('language-'))
          : undefined
        const lang = langClass ? langClass.slice('language-'.length) : undefined
        const textNode = codeNode.children?.[0]
        const text = textNode?.type === 'text' ? textNode.value.replace(/\n$/, '') : ''
        return <CodeBlock code={text} lang={lang} />
      }
      return <pre className={MdStyles.pre}>{props.children}</pre>
    }

    const code: Components['code'] = (props) => <code className={MdStyles.inlineCode}>{props.children}</code>

    const wikilink = ({ node }: { node?: HastElement }) => {
      const title = String(hastProperties(node).title ?? '')
      return <WikilinkButton title={title} notes={notesRef.current} allowNavigate={fullscreen} />
    }

    const timestamp = ({ node }: { node?: HastElement }) => {
      const props = hastProperties(node)
      const kind: 'video' | 'audio' = props.kind === 'audio' ? 'audio' : 'video'
      const index = Number(props.index ?? 0)
      const time = String(props.time ?? '')
      return <TimestampButton kind={kind} index={index} time={time} onSeek={seek} />
    }

    return { img, a, p, pre, code, 'jnana-wikilink': wikilink, 'jnana-timestamp': timestamp } as Components
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lazy, fullscreen, noteId, layoutMap])

  return (
    <div ref={containerRef} className={MdStyles.root}>
      <MemoizedMarkdown content={content} components={components} />
    </div>
  )
}

/** Split out so MarkdownLite re-rendering (e.g. forced by NotesContext changing on
 *  every save — see the note above) doesn't force a full react-markdown re-parse
 *  unless `content`/`components` actually changed for *this* card. */
const MemoizedMarkdown = memo(function MemoizedMarkdown({
  content,
  components,
}: {
  content: string
  components: Components
}) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} urlTransform={jnanaUrlTransform} components={components}>
      {content}
    </ReactMarkdown>
  )
})
