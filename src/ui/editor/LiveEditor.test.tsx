// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { createRef } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { LiveEditor, type LiveEditorHandle } from './LiveEditor'

vi.mock('../../context/NotesContext', () => ({
  useNotesContext: () => ({
    notes: [{ id: '1', title: 'Existing Note', content: '', tags: [], createdAt: 0, updatedAt: 0 }],
  }),
}))
vi.mock('../../context/TranscriptionContext', () => ({
  useTranscription: () => ({ jobs: [], transcribe: vi.fn() }),
}))
vi.mock('../AsyncImage', () => ({ AsyncImage: () => <img data-testid="async-image" /> }))
vi.mock('../AsyncVideo', () => ({ AsyncVideo: () => <video data-testid="async-video" /> }))
vi.mock('../AsyncAudio', () => ({ AsyncAudio: () => <audio data-testid="async-audio" /> }))
vi.mock('../AsyncYouTube', () => ({ AsyncYouTube: () => <div data-testid="async-youtube" /> }))
vi.mock('../media/PdfViewer', () => ({ PdfViewer: () => <div data-testid="pdf-viewer" /> }))
vi.mock('../media/PdfThumbnail', () => ({ PdfThumbnail: () => <div data-testid="pdf-thumbnail" /> }))
vi.mock('../WebEmbed', () => ({ WebEmbed: () => <div data-testid="web-embed" /> }))

const NOTES = [{ id: '1', title: 'Existing Note', content: '', tags: [], createdAt: 0, updatedAt: 0 }] as any

describe('LiveEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the initial value', () => {
    const { container } = render(<LiveEditor value="Hello world" onChange={vi.fn()} notes={NOTES} />)
    expect(container.querySelector('.cm-editor')).toBeTruthy()
    expect(container.textContent).toContain('Hello world')
  })

  it('hides bold markers and styles the content', () => {
    const { container, queryByText } = render(<LiveEditor value="Some **bold** text" onChange={vi.fn()} notes={NOTES} />)
    expect(container.querySelector('.cm-editor')?.textContent).toBe('Some bold text')
    const styled = queryByText('bold')
    expect(styled).toBeTruthy()
  })

  it('hides heading markers and styles the heading', () => {
    const { container } = render(<LiveEditor value="# Title" onChange={vi.fn()} notes={NOTES} />)
    expect(container.querySelector('.cm-editor')?.textContent).toBe('Title')
  })

  it('renders a video embed widget instead of the raw path', () => {
    const { getByTestId, container } = render(
      <LiveEditor value="![video](jnana-asset://a.mp4)" onChange={vi.fn()} notes={NOTES} />,
    )
    expect(getByTestId('async-video')).toBeDefined()
    expect(container.querySelector('.cm-editor')?.textContent).not.toContain('jnana-asset')
  })

  it('renders a wikilink as a button widget, not raw brackets', () => {
    const { container, getByText } = render(
      <LiveEditor value="See [[Existing Note]] please" onChange={vi.fn()} notes={NOTES} />,
    )
    const btn = getByText('Existing Note')
    expect(btn.tagName).toBe('BUTTON')
    expect(container.querySelector('.cm-editor')?.textContent).not.toContain('[[')
  })

  it('assigns document-order indices across mixed video/audio embeds', () => {
    const { container } = render(
      <LiveEditor
        value={'![video](jnana-asset://a.mp4)\n\n![audio](jnana-asset://b.mp3)\n\n![video](jnana-asset://c.mp4)'}
        onChange={vi.fn()}
        notes={NOTES}
      />,
    )
    const videos = container.querySelectorAll('[data-video-index]')
    const audios = container.querySelectorAll('[data-audio-index]')
    expect(videos).toHaveLength(2)
    expect(audios).toHaveLength(1)
    expect(videos[0].getAttribute('data-video-index')).toBe('0')
    expect(videos[1].getAttribute('data-video-index')).toBe('1')
  })

  it('calls onChange when the document changes', async () => {
    const onChange = vi.fn()
    const ref = createRef<LiveEditorHandle>()
    render(<LiveEditor ref={ref} value="abc" onChange={onChange} notes={NOTES} />)
    // Drive a change the same way the imperative API does (selection-based replace).
    ref.current?.applyFormatAtSelection('bold')
    await waitFor(() => expect(onChange).toHaveBeenCalled())
  })

  it('applyFormatAtSelection inserts bold markers at the (default, collapsed) cursor', async () => {
    // No selection API is exposed on the ref (intentionally minimal) — this
    // exercises the wiring (CM6 selection -> applyFormat -> dispatch) with
    // the default cursor-at-0 position; full applyFormat behavior coverage
    // (including real selections) lives in core/markdown/format.test.ts.
    const onChange = vi.fn()
    const ref = createRef<LiveEditorHandle>()
    render(<LiveEditor ref={ref} value="abc" onChange={onChange} notes={NOTES} />)
    ref.current?.applyFormatAtSelection('bold')
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('****abc'))
  })

  // Pasting a screenshot is the same gesture as the toolbar's image import, so
  // it belongs to the editor itself — not to whichever parent happened to pass
  // an onPaste prop. EditorPane (Working Notes) and NoteItem both mount
  // LiveEditor without one, which is why paste silently did nothing there.
  describe('image paste', () => {
    const importHandlers = () => ({
      onImageUpload: vi.fn(),
      onVideoUpload: vi.fn(),
      onAudioUpload: vi.fn(),
      onDocumentUpload: vi.fn(),
    })

    /**
     * A paste event carrying `items`, the way a real clipboard delivers files.
     * `text` is the text/plain fallback that rides along — on Windows, copying
     * an image file puts its path there, which CM6 would otherwise insert.
     *
     * Note `defaultPrevented` is useless as an assertion here: CM6 cancels every
     * paste it sees, handled or not. Assert the observable effect instead.
     */
    function pasteEvent(items: { type: string; getAsFile?: () => File | null }[], text = '') {
      const e = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
        clipboardData: unknown
      }
      e.clipboardData = { items, getData: () => text, files: [] }
      return e
    }

    function pasteInto(container: HTMLElement, e: Event) {
      const content = container.querySelector('.cm-content')
      expect(content).toBeTruthy()
      content!.dispatchEvent(e)
    }

    it('uploads an image pasted from the clipboard', () => {
      const handlers = importHandlers()
      const onChange = vi.fn()
      const { container } = render(
        <LiveEditor value="abc" onChange={onChange} notes={NOTES} importHandlers={handlers} />,
      )
      const file = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })
      const e = pasteEvent([{ type: 'image/png', getAsFile: () => file }], 'C:\\shots\\image.png')

      pasteInto(container, e)

      expect(handlers.onImageUpload).toHaveBeenCalledTimes(1)
      expect(handlers.onImageUpload.mock.calls[0][0]).toBe(file)
      // CM6's own text insert must not also run, or the clipboard's text/plain
      // fallback (the file path, on Windows) lands in the document beside it.
      expect(onChange).not.toHaveBeenCalled()
    })

    it('leaves a plain-text paste to the editor', () => {
      const handlers = importHandlers()
      const { container } = render(
        <LiveEditor value="abc" onChange={vi.fn()} notes={NOTES} importHandlers={handlers} />,
      )

      pasteInto(container, pasteEvent([{ type: 'text/plain' }], 'hello'))

      expect(handlers.onImageUpload).not.toHaveBeenCalled()
    })

    it('ignores an image paste when there is nowhere to upload it', () => {
      // No importHandlers — the mount sites that don't wire a composer. The
      // optional chaining must hold rather than throwing into CM6's handler.
      const { container } = render(<LiveEditor value="abc" onChange={vi.fn()} notes={NOTES} />)
      const file = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' })

      expect(() =>
        pasteInto(container, pasteEvent([{ type: 'image/png', getAsFile: () => file }])),
      ).not.toThrow()
    })
  })
})
