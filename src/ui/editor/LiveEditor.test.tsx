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
})
