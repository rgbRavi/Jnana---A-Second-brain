// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { createRef } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { LiveEditor, type LiveEditorHandle } from './LiveEditor'

// Overrides the no-op in setupTests: capture the handler so a test can drive a
// window-level file drop the way Tauri would.
const dragDropHandlers: ((e: { payload: unknown }) => unknown)[] = []
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (handler: (e: { payload: unknown }) => unknown) => {
      dragDropHandlers.push(handler)
      return Promise.resolve(() => {
        dragDropHandlers.splice(dragDropHandlers.indexOf(handler), 1)
      })
    },
  }),
}))

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

  // An embed is one object: the arrow keys step over its `![alt](url)` token
  // and a delete takes the whole thing, instead of crawling through / chewing
  // up the hidden markup (which breaks the parse and reveals the raw text).
  describe('media embeds are atomic', () => {
    const TOKEN = '![a](jnana-asset://x.png)'
    const DOC = `Hi ${TOKEN} there`
    const TOKEN_FROM = 'Hi '.length
    const TOKEN_TO = TOKEN_FROM + TOKEN.length

    const mount = () => {
      const { container } = render(<LiveEditor value={DOC} onChange={vi.fn()} notes={NOTES} />)
      const view = EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)
      expect(view).toBeTruthy()
      return { view: view as EditorView, container }
    }

    it('moves the cursor across the whole token in one arrow press', () => {
      const { view } = mount()
      view.dispatch({ selection: { anchor: TOKEN_FROM } })
      fireEvent.keyDown(view.contentDOM, { key: 'ArrowRight' })
      expect(view.state.selection.main.head).toBe(TOKEN_TO)
      fireEvent.keyDown(view.contentDOM, { key: 'ArrowLeft' })
      expect(view.state.selection.main.head).toBe(TOKEN_FROM)
    })

    it('Backspace after the embed deletes the whole token', () => {
      const { view } = mount()
      view.dispatch({ selection: { anchor: TOKEN_TO } })
      fireEvent.keyDown(view.contentDOM, { key: 'Backspace' })
      expect(view.state.doc.toString()).toBe('Hi  there')
    })

    it('Delete before the embed deletes the whole token', () => {
      const { view } = mount()
      view.dispatch({ selection: { anchor: TOKEN_FROM } })
      fireEvent.keyDown(view.contentDOM, { key: 'Delete' })
      expect(view.state.doc.toString()).toBe('Hi  there')
    })

    it('stays rendered while a selection covers it', () => {
      // Dragging a selection across an embed used to flip it back to the raw
      // `![alt](url)` mid-gesture, because every other construct un-hides its
      // markup when the selection touches it.
      const { view, container } = mount()
      view.dispatch({ selection: { anchor: 0, head: DOC.length } })
      expect(container.querySelector('[data-testid="async-image"]')).toBeTruthy()
      expect(view.contentDOM.textContent).not.toContain(TOKEN)
    })

    it('leaves ordinary text one character at a time', () => {
      const { view } = mount()
      view.dispatch({ selection: { anchor: DOC.length } })
      fireEvent.keyDown(view.contentDOM, { key: 'Backspace' })
      expect(view.state.doc.toString()).toBe(`Hi ${TOKEN} ther`)
    })
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

  // Tauri intercepts OS file drops at the window level — there is no DOM drop
  // event — so the editor subscribes and hit-tests the drop point itself.
  describe('file drop', () => {
    const importHandlers = () => ({
      onImageUpload: vi.fn(),
      onFileUpload: vi.fn(),
      onVideoUpload: vi.fn(),
      onAudioUpload: vi.fn(),
      onDocumentUpload: vi.fn(),
      onDocumentPaste: vi.fn(),
      onDroppedPath: vi.fn(),
    })

    const emit = async (payload: unknown) => {
      await Promise.all(dragDropHandlers.map((h) => h({ payload })))
    }

    /** Point the drop at this editor (or not). jsdom has no elementFromPoint —
     *  it's a layout query — so define one rather than spy on it. */
    const aimAt = (container: HTMLElement, hit: boolean) => {
      const content = container.querySelector('.cm-content') as HTMLElement
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: () => (hit ? content : document.body),
      })
    }

    const mountEditor = async (handlers: ReturnType<typeof importHandlers>) => {
      const { container } = render(
        <LiveEditor value="abc" onChange={vi.fn()} notes={NOTES} importHandlers={handlers} />,
      )
      await waitFor(() => expect(dragDropHandlers.length).toBeGreaterThan(0))
      return container
    }

    it('imports every dropped path, in order', async () => {
      const handlers = importHandlers()
      const container = await mountEditor(handlers)
      aimAt(container, true)

      await emit({ type: 'drop', paths: ['C:\a\one.png', 'C:\a\two.docx'], position: { x: 10, y: 10 } })

      expect(handlers.onDroppedPath.mock.calls.map((c) => c[0])).toEqual([
        'C:\a\one.png',
        'C:\a\two.docx',
      ])
    })

    // Tauri sends no 'leave' after a drop, so the handler has to clear the
    // affordance itself — it used to latch on and tint the editor permanently.
    it('clears the drag affordance once the files land', async () => {
      const handlers = importHandlers()
      const container = await mountEditor(handlers)
      aimAt(container, true)
      const host = container.firstElementChild as HTMLElement

      await emit({ type: 'over', position: { x: 10, y: 10 } })
      await waitFor(() => expect(host.className).toContain('dropActive'))

      await emit({ type: 'drop', paths: ['C:\a\one.png'], position: { x: 10, y: 10 } })
      await waitFor(() => expect(host.className).not.toContain('dropActive'))
    })

    it('ignores a drop landing outside this editor', async () => {
      const handlers = importHandlers()
      const container = await mountEditor(handlers)
      aimAt(container, false)

      await emit({ type: 'drop', paths: ['C:\a\one.png'], position: { x: 10, y: 10 } })

      expect(handlers.onDroppedPath).not.toHaveBeenCalled()
    })

    it('unsubscribes on unmount', async () => {
      const { unmount } = render(<LiveEditor value="abc" onChange={vi.fn()} notes={NOTES} />)
      await waitFor(() => expect(dragDropHandlers.length).toBe(1))
      unmount()
      await waitFor(() => expect(dragDropHandlers.length).toBe(0))
    })
  })

  // Pandoc's extracted text and anything off the Windows clipboard carry CRLF.
  // CM6 normalizes line endings on the way into the document, so the inserted
  // run is shorter there than in JS — computing the cursor as `from + md.length`
  // overshot the end of the document and threw "Selection points outside of
  // document", which the document importer then reported as a missing Pandoc.
  // Only reproducible with the caret at the end: anywhere else, the text after
  // it absorbs the overshoot.
  it('inserts text containing CRLF at the end of the document', async () => {
    const onChange = vi.fn()
    const ref = createRef<LiveEditorHandle>()
    const { container } = render(
      <LiveEditor ref={ref} value="abc" onChange={onChange} notes={NOTES} />,
    )
    const view = EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)
    view!.dispatch({ selection: { anchor: view!.state.doc.length } })

    expect(() => ref.current?.insertAtCursor('one\r\ntwo')).not.toThrow()
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('abcone\ntwo'))
  })

  // Pasting a screenshot or an OS-copied media file is the same gesture as the
  // toolbar's import, so it belongs to the editor itself — not to whichever
  // parent happened to pass an onPaste prop. EditorPane (Working Notes) and
  // NoteItem both mount LiveEditor without one, which is why paste silently
  // did nothing there.
  describe('file paste', () => {
    const importHandlers = () => ({
      onImageUpload: vi.fn(),
      onFileUpload: vi.fn(),
      onVideoUpload: vi.fn(),
      onAudioUpload: vi.fn(),
      onDocumentUpload: vi.fn(),
      onDocumentPaste: vi.fn(),
      onDroppedPath: vi.fn(),
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
      e.clipboardData = {
        // `kind` is what separates a real file from the text/plain fallback
        // that rides along with it — the handler filters on it.
        items: items.map((i) => ({ kind: i.getAsFile ? 'file' : 'string', ...i })),
        getData: () => text,
        files: [],
      }
      return e
    }

    function pasteInto(container: HTMLElement, e: Event) {
      const content = container.querySelector('.cm-content')
      expect(content).toBeTruthy()
      content!.dispatchEvent(e)
    }

    it.each([
      ['image/png', 'shot.png', 'image'],
      ['video/mp4', 'clip.mp4', 'video'],
      ['audio/mpeg', 'song.mp3', 'audio'],
      ['application/pdf', 'paper.pdf', 'pdf'],
    ])('uploads a pasted %s as a %s embed', (type, name, kind) => {
      const handlers = importHandlers()
      const { container } = render(
        <LiveEditor value="abc" onChange={vi.fn()} notes={NOTES} importHandlers={handlers} />,
      )
      const file = new File([new Uint8Array([1, 2, 3])], name, { type })

      pasteInto(container, pasteEvent([{ type, getAsFile: () => file }], `C:\files\${name}`))

      expect(handlers.onFileUpload).toHaveBeenCalledTimes(1)
      expect(handlers.onFileUpload.mock.calls[0]).toEqual([file, kind])
    })

    // A document can't become an embed on its own — it goes to the importer,
    // which asks convert / extract / link exactly as the toolbar button does.
    it.each([
      ['notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      // A file copied in the OS file manager often carries no usable MIME type,
      // so the extension is what the handler matches on.
      ['budget.xlsx', ''],
      ['old.doc', 'application/octet-stream'],
    ])('sends a pasted %s to the document importer', (name, type) => {
      const handlers = importHandlers()
      const { container } = render(
        <LiveEditor value="abc" onChange={vi.fn()} notes={NOTES} importHandlers={handlers} />,
      )
      const file = new File([new Uint8Array([1])], name, { type })

      pasteInto(container, pasteEvent([{ type, getAsFile: () => file }], `C:\files\${name}`))

      expect(handlers.onDocumentPaste).toHaveBeenCalledTimes(1)
      expect(handlers.onDocumentPaste.mock.calls[0][0]).toBe(file)
      expect(handlers.onFileUpload).not.toHaveBeenCalled()
    })

    it('leaves a file it cannot import to the editor', () => {
      const handlers = importHandlers()
      const { container } = render(
        <LiveEditor value="abc" onChange={vi.fn()} notes={NOTES} importHandlers={handlers} />,
      )
      const file = new File([new Uint8Array([1])], 'setup.exe', { type: 'application/octet-stream' })

      pasteInto(container, pasteEvent([{ type: file.type, getAsFile: () => file }], 'C:\setup.exe'))

      expect(handlers.onFileUpload).not.toHaveBeenCalled()
      expect(handlers.onDocumentPaste).not.toHaveBeenCalled()
    })

    it('uploads an image pasted from the clipboard', () => {
      const handlers = importHandlers()
      const onChange = vi.fn()
      const { container } = render(
        <LiveEditor value="abc" onChange={onChange} notes={NOTES} importHandlers={handlers} />,
      )
      const file = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })
      const e = pasteEvent([{ type: 'image/png', getAsFile: () => file }], 'C:\\shots\\image.png')

      pasteInto(container, e)

      expect(handlers.onFileUpload).toHaveBeenCalledTimes(1)
      expect(handlers.onFileUpload.mock.calls[0][0]).toBe(file)
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

      expect(handlers.onFileUpload).not.toHaveBeenCalled()
      expect(handlers.onDocumentPaste).not.toHaveBeenCalled()
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
