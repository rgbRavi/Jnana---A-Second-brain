import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MarkdownLite } from './MarkdownLite'

// Mock external dependencies that are difficult to render in tests
vi.mock('../../context/NotesContext', () => ({
  useNotesContext: () => ({
    notes: [{ id: '1', title: 'Existing Note', content: '', tags: [], createdAt: 0, updatedAt: 0 }]
  })
}))

vi.mock('../AsyncImage', () => ({ AsyncImage: ({ alt }: any) => <img data-testid="async-image" alt={alt} /> }))
vi.mock('../AsyncVideo', () => ({ AsyncVideo: () => <video data-testid="async-video" /> }))
vi.mock('../AsyncYouTube', () => ({ AsyncYouTube: () => <div data-testid="async-youtube" /> }))
vi.mock('../media/PdfViewer', () => ({ PdfViewer: () => <div data-testid="pdf-viewer" /> }))

// Mock Tauri plugin opener
vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn()
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

  it('renders pdf embeds', () => {
    const { getByTestId } = render(<MarkdownLite content="![pdf](jnana-asset://doc.pdf)" />)
    expect(getByTestId('pdf-viewer')).toBeDefined()
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
})
