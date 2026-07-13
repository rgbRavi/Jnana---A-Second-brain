// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { MarkdownLite } from './MarkdownLite'

// Mock external dependencies that are difficult to render in tests
vi.mock('../../context/NotesContext', () => ({
  useNotesContext: () => ({
    notes: [{ id: '1', title: 'Existing Note', content: '', tags: [], createdAt: 0, updatedAt: 0 }]
  })
}))

vi.mock('../../context/TranscriptionContext', () => ({
  useTranscription: () => ({ jobs: [], transcribe: vi.fn() })
}))

vi.mock('../AsyncImage', () => ({
  AsyncImage: ({ alt, filename }: any) => <img data-testid="async-image" alt={alt} data-filename={filename} />,
}))
vi.mock('../AsyncVideo', () => ({ AsyncVideo: () => <video data-testid="async-video" /> }))
vi.mock('../AsyncAudio', () => ({ AsyncAudio: () => <audio data-testid="async-audio" /> }))
vi.mock('../AsyncYouTube', () => ({ AsyncYouTube: () => <div data-testid="async-youtube" /> }))
vi.mock('../media/PdfViewer', () => ({ PdfViewer: () => <div data-testid="pdf-viewer" /> }))
vi.mock('../media/PdfThumbnail', () => ({ PdfThumbnail: () => <div data-testid="pdf-thumbnail" /> }))

const { openUrlMock } = vi.hoisted(() => ({ openUrlMock: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
  openUrl: openUrlMock,
}))

describe('MarkdownLite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders plain text correctly', () => {
    const { container } = render(<MarkdownLite content="Hello World" />)
    expect(container.textContent).toBe('Hello World')
  })

  it('renders wikilinks', () => {
    const { getByText } = render(<MarkdownLite content="Check out [[Existing Note]]" />)
    const btn = getByText('Existing Note')
    expect(btn.tagName).toBe('BUTTON')
    // Should have valid class since the note exists in mock
    expect(btn.className).not.toContain('wikilinkBtnMissing')
  })

  it('renders missing wikilinks with a different class', () => {
    const { getByText } = render(<MarkdownLite content="Check out [[Missing Note]]" />)
    const btn = getByText('Missing Note')
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.className).toContain('wikilinkBtnMissing')
  })

  it('renders indexed video timestamps', () => {
    const { getByText } = render(<MarkdownLite content="Watch at [V0::01:23:45]" />)
    const btn = getByText('01:23:45')
    expect(btn.tagName).toBe('BUTTON')
  })

  it('renders simple timestamps', () => {
    const { getByText } = render(<MarkdownLite content="Look at [05:12]" />)
    const btn = getByText('05:12')
    expect(btn.tagName).toBe('BUTTON')
  })

  it('renders images', () => {
    const { getByTestId } = render(<MarkdownLite content="![my alt text](jnana-asset://foo.jpg)" />)
    const img = getByTestId('async-image')
    expect(img).toBeDefined()
    expect(img.getAttribute('alt')).toBe('my alt text')
  })

  it('renders videos', () => {
    const { getByTestId } = render(<MarkdownLite content="![video](jnana-asset://foo.mp4)" />)
    expect(getByTestId('async-video')).toBeDefined()
  })

  it('renders youtube embeds', () => {
    const { getByTestId } = render(<MarkdownLite content="![youtube](https://youtube.com/watch?v=dQw4w9WgXcQ)" />)
    expect(getByTestId('async-youtube')).toBeDefined()
  })

  it('renders pdf embeds as a thumbnail', () => {
    const { getByTestId } = render(<MarkdownLite content="![pdf](jnana-asset://doc.pdf)" />)
    expect(getByTestId('pdf-thumbnail')).toBeDefined()
  })

  it('renders external doc links', () => {
    const { getByText } = render(<MarkdownLite content="[External: My Doc](external://C:/foo.docx)" />)
    expect(getByText('My Doc')).toBeDefined()
    expect(getByText('Open')).toBeDefined()
  })

  it('renders mixed content correctly', () => {
    const content = 'Text with [[Existing Note]] and ![my img](jnana-asset://a.png) and [V0::00:01:00]'
    const { getByText, getByTestId } = render(<MarkdownLite content={content} />)
    expect(getByText('Existing Note')).toBeDefined()
    expect(getByTestId('async-image')).toBeDefined()
    expect(getByText('00:01:00')).toBeDefined()
  })

  describe('text colour', () => {
    it('renders a colour token as a styled span with the palette hex', () => {
      const { getByText } = render(<MarkdownLite content="a [c:red]hot[/c] b" />)
      const span = getByText('hot')
      expect(span.tagName).toBe('SPAN')
      expect(span.style.color).toBe('rgb(229, 72, 77)') // #e5484d
    })

    it('accepts a raw hex colour value', () => {
      const { getByText } = render(<MarkdownLite content="[c:#00ff00]go[/c]" />)
      expect(getByText('go').style.color).toBe('rgb(0, 255, 0)')
    })

    it('renders text but no colour for an unsafe value', () => {
      const { container } = render(<MarkdownLite content="[c:rgb(1,2,3)]x[/c]" />)
      // Unsafe value (parens) → the token doesn't match, so it stays literal text
      // and no styled span is produced.
      expect(container.textContent).toContain('[c:rgb(1,2,3)]x[/c]')
      expect(container.querySelector('span[style]')).toBeNull()
    })
  })

  describe('highlight', () => {
    it('renders a highlight token as a span with the inner text, markers stripped', () => {
      const { getByText, container } = render(<MarkdownLite content="a [h:teal]hot[/h] b" />)
      const span = getByText('hot')
      expect(span.tagName).toBe('SPAN')
      expect(container.textContent).not.toContain('[h:teal]')
    })

    it('renders text but no highlight for an unsafe value', () => {
      const { container } = render(<MarkdownLite content="[h:rgb(1,2,3)]x[/h]" />)
      expect(container.textContent).toContain('[h:rgb(1,2,3)]x[/h]')
      expect(container.querySelector('span[style]')).toBeNull()
    })

    it('renders a highlight nested inside a text colour as nested spans', () => {
      const { getByText, container } = render(<MarkdownLite content="[c:red][h:teal]word[/h][/c]" />)
      const inner = getByText('word')
      expect(inner.tagName).toBe('SPAN')
      // The inner span is the highlight (its border-radius is the tell — the
      // color-mix background itself is dropped by jsdom's CSS parser); its parent
      // span is the text colour.
      expect(inner.style.borderRadius).toBe('0.2em')
      const outer = inner.parentElement as HTMLElement
      expect(outer.tagName).toBe('SPAN')
      expect(outer.style.color).toBe('rgb(229, 72, 77)') // #e5484d
      // no literal token markers leak into the output.
      expect(container.textContent).toBe('word')
    })
  })

  describe('real markdown', () => {
    it('renders headings, bold, and lists as real elements', () => {
      const content = '# Title\n\nSome **bold** text.\n\n- one\n- two'
      const { container, getByText } = render(<MarkdownLite content={content} />)
      expect(container.querySelector('h1')?.textContent).toBe('Title')
      expect(getByText('bold').tagName).toBe('STRONG')
      expect(container.querySelectorAll('li')).toHaveLength(2)
    })

    it('renders a GFM table', () => {
      const content = '| A | B |\n| - | - |\n| 1 | 2 |'
      const { container } = render(<MarkdownLite content={content} />)
      expect(container.querySelector('table')).toBeTruthy()
      expect(container.querySelectorAll('th')).toHaveLength(2)
      expect(container.querySelectorAll('td')).toHaveLength(2)
    })

    it('leaves tokens inside a fenced code block literal', () => {
      const content = '```\n[[Not a link]]\n```'
      const { container, queryByRole } = render(<MarkdownLite content={content} />)
      expect(container.querySelector('pre')?.textContent).toContain('[[Not a link]]')
      expect(queryByRole('button', { name: 'Not a link' })).toBeNull()
    })
  })

  describe('media indexing', () => {
    it('assigns document-order indices across mixed video/audio embeds', () => {
      const content = '![video](jnana-asset://a.mp4)\n\n![audio](jnana-asset://b.mp3)\n\n![video](jnana-asset://c.mp4)'
      const { container } = render(<MarkdownLite content={content} />)
      const videos = container.querySelectorAll('[data-video-index]')
      const audios = container.querySelectorAll('[data-audio-index]')
      expect(videos).toHaveLength(2)
      expect(audios).toHaveLength(1)
      expect(videos[0].getAttribute('data-video-index')).toBe('0')
      expect(videos[1].getAttribute('data-video-index')).toBe('1')
      expect(audios[0].getAttribute('data-audio-index')).toBe('0')
    })
  })

  describe('urlTransform', () => {
    it('preserves jnana-asset:// urls through to the embed component', () => {
      const { getByTestId } = render(<MarkdownLite content="![photo](jnana-asset://my-file.png)" />)
      expect(getByTestId('async-image').getAttribute('data-filename')).toBe('my-file.png')
    })

    it('opens an ordinary https link via the Tauri opener instead of navigating', () => {
      const { getByText } = render(<MarkdownLite content="[Example](https://example.com)" />)
      const link = getByText('Example')
      expect(link.tagName).toBe('A')
      fireEvent.click(link)
      expect(openUrlMock).toHaveBeenCalledWith('https://example.com')
    })
  })
})
