// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolContext } from './tools'

const { webSearch, readPage } = vi.hoisted(() => ({ webSearch: vi.fn(), readPage: vi.fn() }))
vi.mock('../web', () => ({ webSearch }))
vi.mock('../quizOpen', async (orig) => ({ ...(await orig<typeof import('../quizOpen')>()), readPage }))

import { createWebToolState, makeWebTools } from './webTools'

const ctx = {} as ToolContext
const text = 'photosynthesis converts light energy into chemical energy inside chloroplasts. '.repeat(10)
const page = (url: string) => ({ url, title: 'T', text })
const hit = (i: number) => ({ title: `Hit ${i}`, url: `https://example${i}.com/a?b=1`, snippet: `snip ${i}` })

beforeEach(() => {
  webSearch.mockReset().mockResolvedValue([hit(1), hit(2)])
  readPage.mockReset().mockImplementation(async (u: string) => page(u))
})

const setup = (prior = [] as ReturnType<typeof createWebToolState>['prior'], firstN = 1, allowed: string[] = []) => {
  const state = createWebToolState(prior, firstN, allowed)
  const [search, read] = makeWebTools(state, 4000)
  return { state, search, read }
}

describe('web tools', () => {
  it('web_search enforces the 5-search budget', async () => {
    const { search } = setup()
    const out: string[] = []
    for (let i = 0; i < 6; i++) out.push(await search.run({ query: 'x' }, ctx))
    expect(out[5]).toBe('Search budget reached — answer with what you have.')
    expect(webSearch).toHaveBeenCalledTimes(5)
  })

  it('read_page enforces the 10-read budget', async () => {
    const { search, read } = setup()
    await search.run({ query: 'x' }, ctx)
    const out: string[] = []
    for (let i = 0; i < 11; i++) out.push(await read.run({ result: 1 }, ctx))
    expect(out[10]).toMatch(/budget reached/)
    expect(readPage).toHaveBeenCalledTimes(10)
  })

  it('read_page by result number assigns the next page number and records keywords', async () => {
    const { state, search, read } = setup([], 3)
    await search.run({ query: 'x' }, ctx)
    const r = await read.run({ result: 2 }, ctx)
    expect(r).toContain('<page n="3"')
    expect(state.pages.map((p) => p.n)).toEqual([3])
    expect(state.pages[0].seen).toBeTruthy()
    expect(state.sources[0].n).toBe(3)
    expect(state.sources[0].keywords).toContain('photosynthesis')
    expect(state.nextN).toBe(4)
  })

  it('read_page of an earlier page keeps its number', async () => {
    const prior = [{ n: 2, url: 'https://old.com/x', title: 'Old', keywords: [] }]
    const { state, read } = setup(prior, 3)
    const r = await read.run({ page: 2 }, ctx)
    expect(r).toContain('<page n="2"')
    expect(state.pages[0].n).toBe(2)
    expect(state.nextN).toBe(3)
    expect(state.prior).toBe(prior)
  })

  it('rejects non-http urls and unreadable pages', async () => {
    const { read } = setup([], 1, ['https://a.com/'])
    expect(await read.run({ url: 'file:///etc/passwd' }, ctx)).toBe("Couldn't read that page.")
    readPage.mockResolvedValueOnce(null)
    expect(await read.run({ url: 'https://a.com/' }, ctx)).toBe("Couldn't read that page.")
  })

  it('tool results never contain a full URL', async () => {
    const { search, read } = setup()
    const s = await search.run({ query: 'x' }, ctx)
    const r = await read.run({ result: 1 }, ctx)
    expect(s).toContain('example1.com')
    expect(s + r).not.toMatch(/http/)
  })

  const REFUSED = 'I can only read links from your message, search results, or earlier pages.'

  it('refuses an invented url without fetching, but still counts the read', async () => {
    const { state, read } = setup()
    expect(await read.run({ url: 'https://attacker.com/?d=secret' }, ctx)).toBe(REFUSED)
    expect(readPage).not.toHaveBeenCalled()
    expect(state.reads).toBe(1)
  })

  it('accepts message links and urls from any earlier search', async () => {
    const { search, read } = setup([], 1, ['https://msg.com/p'])
    expect(await read.run({ url: 'https://msg.com/p' }, ctx)).toContain('<page n="1"')
    await search.run({ query: 'a' }, ctx)
    webSearch.mockResolvedValue([hit(9)])
    await search.run({ query: 'b' }, ctx)
    expect(await read.run({ url: hit(1).url }, ctx)).toContain('<page n="2"')
  })

  it('a redirected page read twice keeps one number', async () => {
    readPage.mockImplementation(async () => page('https://final.com/x'))
    const { state, search, read } = setup()
    await search.run({ query: 'a' }, ctx)
    await read.run({ result: 1 }, ctx)
    const r = await read.run({ url: 'https://final.com/x' }, ctx)
    await read.run({ url: hit(1).url }, ctx)
    expect(r).toContain('<page n="1"')
    expect(state.pages).toHaveLength(1)
    expect(state.sources).toHaveLength(1)
    expect(state.nextN).toBe(2)
  })

  it('stores a one-line, capped page title', async () => {
    readPage.mockImplementation(async (u: string) => ({ url: u, title: `A\n\n- [x](y)\t${'z'.repeat(300)}`, text }))
    const { state, search, read } = setup()
    await search.run({ query: 'a' }, ctx)
    await read.run({ result: 1 }, ctx)
    expect(state.sources[0].title.startsWith('A - [x](y) z')).toBe(true)
    expect(state.sources[0].title.length).toBeLessThanOrEqual(150)
  })
})
