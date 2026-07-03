import { describe, it, expect } from 'vitest'
import { parser } from '@lezer/markdown'
import { lezerJnana } from './lezerJnana'

const configured = parser.configure(lezerJnana)

interface FoundNode {
  from: number
  to: number
}

// `tree.iterate()` reuses/mutates its SyntaxNodeRef across calls (for
// performance) — it's a live cursor, not a stable snapshot. Extract the
// primitives (from/to) immediately inside `enter`, never store the ref itself.
function findAll(text: string, name: string): FoundNode[] {
  const tree = configured.parse(text)
  const found: FoundNode[] = []
  tree.iterate({
    enter(node) {
      if (node.type.name === name) found.push({ from: node.from, to: node.to })
    },
  })
  return found
}

function sliceOf(text: string, node: FoundNode): string {
  return text.slice(node.from, node.to)
}

describe('lezerJnana', () => {
  describe('wikilinks', () => {
    it('recognizes [[Title]] as a JnanaWikilink node', () => {
      const text = 'See [[My Note]] for details.'
      const [link] = findAll(text, 'JnanaWikilink')
      expect(link).toBeDefined()
      expect(sliceOf(text, link)).toBe('[[My Note]]')
    })

    it('does not recognize an empty [[ ]]', () => {
      const text = 'Empty: [[ ]] here'
      expect(findAll(text, 'JnanaWikilink')).toHaveLength(0)
    })

    it('a wikilink wrapping a timestamp-shaped title wins over the bare-timestamp pattern', () => {
      const text = '[[00:05]]'
      expect(findAll(text, 'JnanaWikilink')).toHaveLength(1)
      expect(findAll(text, 'JnanaTimestamp')).toHaveLength(0)
    })
  })

  describe('timestamps', () => {
    it('recognizes an indexed video timestamp', () => {
      const text = 'Watch at [V2::01:23:45]'
      const [ts] = findAll(text, 'JnanaTimestamp')
      expect(sliceOf(text, ts)).toBe('[V2::01:23:45]')
    })

    it('recognizes an indexed audio timestamp', () => {
      const text = 'Listen at [A1::00:05:30]'
      const [ts] = findAll(text, 'JnanaTimestamp')
      expect(sliceOf(text, ts)).toBe('[A1::00:05:30]')
    })

    it('recognizes a bare timestamp', () => {
      const text = 'Jump to [05:12]'
      const [ts] = findAll(text, 'JnanaTimestamp')
      expect(sliceOf(text, ts)).toBe('[05:12]')
    })
  })

  describe('code is left literal', () => {
    it('does not transform tokens inside inline code', () => {
      const text = 'Use `[[Not a link]]` literally'
      expect(findAll(text, 'JnanaWikilink')).toHaveLength(0)
    })

    it('does not transform tokens inside a fenced code block', () => {
      const text = '```\n[V0::01:23:45]\n```'
      expect(findAll(text, 'JnanaTimestamp')).toHaveLength(0)
    })
  })

  describe('parity with remarkJnana', () => {
    it('recognizes multiple tokens in one document, in order', () => {
      const text = 'Text with [[Existing Note]] and [V0::00:01:00] and [05:12]'
      const wikilinks = findAll(text, 'JnanaWikilink')
      const timestamps = findAll(text, 'JnanaTimestamp')
      expect(wikilinks).toHaveLength(1)
      expect(timestamps).toHaveLength(2)
      expect(sliceOf(text, wikilinks[0])).toBe('[[Existing Note]]')
    })

    it('still allows ordinary markdown links', () => {
      const text = '[Example](https://example.com)'
      const links = findAll(text, 'Link')
      expect(links).toHaveLength(1)
      expect(findAll(text, 'JnanaWikilink')).toHaveLength(0)
      expect(findAll(text, 'JnanaTimestamp')).toHaveLength(0)
    })
  })
})
