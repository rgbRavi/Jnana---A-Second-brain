import { describe, it, expect } from 'vitest'
import { applyFormat, moveMediaBlock } from './format'

describe('applyFormat', () => {
  describe('inline kinds', () => {
    it('wraps a selection in bold markers and keeps it selected', () => {
      const r = applyFormat('Hello world', 6, 11, 'bold')
      expect(r.text).toBe('Hello **world**')
      expect(r.text.slice(r.selStart, r.selEnd)).toBe('world')
    })

    it('places the caret between empty italic markers', () => {
      const r = applyFormat('Hello world', 5, 5, 'italic')
      expect(r.text).toBe('Hello** world')
      expect(r.selStart).toBe(r.selEnd)
      expect(r.selStart).toBe(6)
    })

    it('wraps with strikethrough', () => {
      const r = applyFormat('done', 0, 4, 'strike')
      expect(r.text).toBe('~~done~~')
      expect(r.text.slice(r.selStart, r.selEnd)).toBe('done')
    })

    it('wraps with inline code', () => {
      const r = applyFormat('const x = 1', 0, 11, 'code')
      expect(r.text).toBe('`const x = 1`')
    })
  })

  describe('block kinds', () => {
    it('prefixes a single line for h1', () => {
      const r = applyFormat('Title', 0, 5, 'h1')
      expect(r.text).toBe('# Title')
      expect(r.text.slice(r.selStart, r.selEnd)).toBe('Title')
    })

    it('prefixes a single line for h2', () => {
      const r = applyFormat('Subtitle', 0, 0, 'h2')
      expect(r.text).toBe('## Subtitle')
    })

    it('prefixes every selected line for a bullet list', () => {
      const text = 'one\ntwo\nthree'
      const r = applyFormat(text, 0, text.length, 'ul')
      expect(r.text).toBe('- one\n- two\n- three')
    })

    it('prefixes every selected line for an ordered list (renders sequential per CommonMark)', () => {
      const text = 'one\ntwo'
      const r = applyFormat(text, 0, text.length, 'ol')
      expect(r.text).toBe('1. one\n1. two')
    })

    it('only prefixes the lines touched by a partial selection', () => {
      const text = 'one\ntwo\nthree'
      // Selection sits inside "two" only.
      const start = text.indexOf('two')
      const end = start + 'two'.length
      const r = applyFormat(text, start, end, 'quote')
      expect(r.text).toBe('one\n> two\nthree')
    })

    it('prefixes the current (empty) line when the cursor has no selection', () => {
      const r = applyFormat('', 0, 0, 'quote')
      expect(r.text).toBe('> ')
      expect(r.selStart).toBe(r.selEnd)
      expect(r.selStart).toBe(2)
    })

    it('keeps selection math consistent across a multi-line block', () => {
      const text = 'aa\nbb\ncc'
      const r = applyFormat(text, 0, text.length, 'quote')
      // 3 lines, each gains "> " (2 chars): selEnd shifts by 2*3=6.
      expect(r.text).toBe('> aa\n> bb\n> cc')
      expect(r.selEnd).toBe(text.length + 6)
    })
  })

  describe('link', () => {
    it('wraps a selection as a link and selects the url placeholder', () => {
      const r = applyFormat('my note', 0, 7, 'link')
      expect(r.text).toBe('[my note](url)')
      expect(r.text.slice(r.selStart, r.selEnd)).toBe('url')
    })

    it('inserts an empty link with the caret inside the label brackets', () => {
      const r = applyFormat('', 0, 0, 'link')
      expect(r.text).toBe('[](url)')
      expect(r.selStart).toBe(r.selEnd)
      expect(r.selStart).toBe(1)
    })
  })

  describe('codeblock', () => {
    it('fences a selection and keeps it selected', () => {
      const r = applyFormat('const x = 1', 0, 11, 'codeblock')
      expect(r.text).toBe('```\nconst x = 1\n```')
      expect(r.text.slice(r.selStart, r.selEnd)).toBe('const x = 1')
    })

    it('fences an empty selection with the caret inside', () => {
      const r = applyFormat('', 0, 0, 'codeblock')
      expect(r.text).toBe('```\n\n```')
      expect(r.selStart).toBe(r.selEnd)
      expect(r.selStart).toBe(4)
    })
  })
})

describe('moveMediaBlock', () => {
  const doc = 'Some text.\n\n![video](a.mp4)\n\n![audio](b.mp3)\n\nMore text.'

  it('moves a block down past the next paragraph', () => {
    // tokenFrom inside '![video](a.mp4)' — line starts at position 12
    const from = 12
    const result = moveMediaBlock(doc, from, 'down')
    expect(result).not.toBeNull()
    const out = doc.slice(0, result!.from) + result!.insert + doc.slice(result!.to)
    expect(out).toBe('Some text.\n\n![audio](b.mp3)\n\n![video](a.mp4)\n\nMore text.')
  })

  it('moves a block up past the previous paragraph', () => {
    // tokenFrom inside '![audio](b.mp3)' — line starts at position 29
    const from = 29
    const result = moveMediaBlock(doc, from, 'up')
    expect(result).not.toBeNull()
    const out = doc.slice(0, result!.from) + result!.insert + doc.slice(result!.to)
    expect(out).toBe('Some text.\n\n![audio](b.mp3)\n\n![video](a.mp4)\n\nMore text.')
  })

  it('returns null when block is already at the top', () => {
    const topDoc = '![video](a.mp4)\n\n![audio](b.mp3)'
    expect(moveMediaBlock(topDoc, 0, 'up')).toBeNull()
  })

  it('returns null when block is already at the bottom', () => {
    const bottomDoc = '![video](a.mp4)\n\n![audio](b.mp3)'
    // tokenFrom inside '![audio](b.mp3)' — line starts at position 17
    expect(moveMediaBlock(bottomDoc, 17, 'down')).toBeNull()
  })

  it('moves a media line up past text with no blank line between them', () => {
    const doc = 'Some text\n![image](url)'
    // tokenFrom at the start of the image line
    const from = 'Some text\n'.length
    const result = moveMediaBlock(doc, from, 'up')
    expect(result).not.toBeNull()
    const out = doc.slice(0, result!.from) + result!.insert + doc.slice(result!.to)
    expect(out).toBe('![image](url)\nSome text')
  })

  it('moves a media line down past text with no blank line between them', () => {
    const doc = '![image](url)\nSome text'
    const result = moveMediaBlock(doc, 0, 'down')
    expect(result).not.toBeNull()
    const out = doc.slice(0, result!.from) + result!.insert + doc.slice(result!.to)
    expect(out).toBe('Some text\n![image](url)')
  })

  it('preserves the blank-line separator between the swapped blocks', () => {
    const threeBlank = 'A\n\n\nB\n\n\nC'
    // tokenFrom=0 is in 'A', move down past 'B' (which starts at position 5)
    const result = moveMediaBlock(threeBlank, 0, 'down')
    expect(result).not.toBeNull()
    const out = threeBlank.slice(0, result!.from) + result!.insert + threeBlank.slice(result!.to)
    expect(out).toBe('B\n\n\nA\n\n\nC')
  })
})
