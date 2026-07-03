import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'
import { remarkJnana } from './remarkJnana'

function parse(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkJnana)
  const tree = processor.parse(markdown)
  return processor.runSync(tree) as Root
}

function findAll(tree: Root, type: string) {
  const found: any[] = []
  visit(tree, type, (node) => {
    found.push(node)
  })
  return found
}

describe('remarkJnana', () => {
  describe('media indexing', () => {
    it('indexes video and audio embeds independently, in document order', () => {
      const tree = parse(
        '![video](jnana-asset://a.mp4)\n\n![audio](jnana-asset://b.mp3)\n\n![video](jnana-asset://c.mp4)',
      )
      const images = findAll(tree, 'image')
      expect(images).toHaveLength(3)
      expect(images[0].data.hProperties['data-video-index']).toBe(0)
      expect(images[1].data.hProperties['data-audio-index']).toBe(0)
      expect(images[2].data.hProperties['data-video-index']).toBe(1)
    })

    it('does not index a plain image (non-video/audio alt)', () => {
      const tree = parse('![my photo](jnana-asset://a.png)')
      const [image] = findAll(tree, 'image')
      expect(image.data?.hProperties?.['data-video-index']).toBeUndefined()
      expect(image.data?.hProperties?.['data-audio-index']).toBeUndefined()
    })
  })

  describe('media key derivation', () => {
    it('keys every media node by url + document-order occurrence ordinal, regardless of alt type', () => {
      const tree = parse(
        '![my photo](jnana-asset://a.png)\n\n![video](jnana-asset://b.mp4)\n\n![audio](jnana-asset://c.mp3)',
      )
      const images = findAll(tree, 'image')
      expect(images.map((n) => n.data.hProperties['data-media-key'])).toEqual([
        'jnana-asset://a.png#0',
        'jnana-asset://b.mp4#0',
        'jnana-asset://c.mp3#0',
      ])
    })

    it('gives duplicate embeds of the same file independent, incrementing keys', () => {
      const tree = parse('![a](jnana-asset://dup.png)\n\n![b](jnana-asset://dup.png)')
      const images = findAll(tree, 'image')
      expect(images.map((n) => n.data.hProperties['data-media-key'])).toEqual([
        'jnana-asset://dup.png#0',
        'jnana-asset://dup.png#1',
      ])
    })
  })

  describe('wikilinks', () => {
    it('converts [[Title]] into a jnana-wikilink node', () => {
      const tree = parse('See [[My Note]] for details.')
      const [link] = findAll(tree, 'jnana-wikilink')
      expect(link.data.hProperties.title).toBe('My Note')
    })

    it('drops an empty [[ ]] (leaves it as literal text)', () => {
      const tree = parse('Empty: [[ ]] here')
      expect(findAll(tree, 'jnana-wikilink')).toHaveLength(0)
      const [text] = findAll(tree, 'text')
      expect(text.value).toContain('[[ ]]')
    })

    it('a wikilink wrapping a timestamp-shaped title wins over the bare-timestamp pattern', () => {
      const tree = parse('[[00:05]]')
      const links = findAll(tree, 'jnana-wikilink')
      const timestamps = findAll(tree, 'jnana-timestamp')
      expect(links).toHaveLength(1)
      expect(links[0].data.hProperties.title).toBe('00:05')
      expect(timestamps).toHaveLength(0)
    })
  })

  describe('timestamps', () => {
    it('converts an indexed video timestamp', () => {
      const tree = parse('Watch at [V2::01:23:45]')
      const [ts] = findAll(tree, 'jnana-timestamp')
      expect(ts.data.hProperties).toEqual({ kind: 'video', index: 2, time: '01:23:45' })
    })

    it('converts an indexed audio timestamp', () => {
      const tree = parse('Listen at [A1::00:05:30]')
      const [ts] = findAll(tree, 'jnana-timestamp')
      expect(ts.data.hProperties).toEqual({ kind: 'audio', index: 1, time: '00:05:30' })
    })

    it('converts a bare timestamp to a video/index-0 token', () => {
      const tree = parse('Jump to [05:12]')
      const [ts] = findAll(tree, 'jnana-timestamp')
      expect(ts.data.hProperties).toEqual({ kind: 'video', index: 0, time: '05:12' })
    })
  })

  describe('code is left literal', () => {
    it('does not transform tokens inside inline code', () => {
      const tree = parse('Use `[[Not a link]]` literally')
      expect(findAll(tree, 'jnana-wikilink')).toHaveLength(0)
      const [code] = findAll(tree, 'inlineCode')
      expect(code.value).toBe('[[Not a link]]')
    })

    it('does not transform tokens inside a fenced code block', () => {
      const tree = parse('```\n[V0::01:23:45]\n```')
      expect(findAll(tree, 'jnana-timestamp')).toHaveLength(0)
      const [code] = findAll(tree, 'code')
      expect(code.value).toBe('[V0::01:23:45]')
    })
  })
})
