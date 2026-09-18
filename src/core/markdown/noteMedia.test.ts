// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { extractNoteMedia } from './noteMedia'

describe('extractNoteMedia', () => {
  it('lists every embed kind in document order, deduped', () => {
    const md = [
      '[External: Report.docx](external://C%3A%5Cdocs%5CReport.docx)',
      '![diagram.png](jnana-asset://a.png)',
      '![video](jnana-asset://b.mp4) ![audio](jnana-asset://c.webm)',
      '![pdf](jnana-asset://d.pdf)',
      '![webpage](https://example.com) ![youtube](https://youtube.com/watch?v=x)',
      '![](https://cdn.example.com/pic.jpg)',
      '![diagram.png](jnana-asset://a.png)',
    ].join('\n')

    expect(extractNoteMedia(md).map((m) => [m.kind, m.source, m.target, m.label])).toEqual([
      ['document', 'path', 'C:\\docs\\Report.docx', 'Report.docx'],
      ['image', 'asset', 'a.png', 'diagram.png'],
      ['video', 'asset', 'b.mp4', 'b.mp4'],
      ['audio', 'asset', 'c.webm', 'c.webm'],
      ['pdf', 'asset', 'd.pdf', 'd.pdf'],
      ['webpage', 'url', 'https://example.com', 'https://example.com'],
      ['youtube', 'url', 'https://youtube.com/watch?v=x', 'https://youtube.com/watch?v=x'],
      ['image', 'url', 'https://cdn.example.com/pic.jpg', 'https://cdn.example.com/pic.jpg'],
    ])
  })

  it('ignores plain links and wikilinks', () => {
    expect(extractNoteMedia('[site](https://x.com) and [[Note]]')).toEqual([])
  })
})
