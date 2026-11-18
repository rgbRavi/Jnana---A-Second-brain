// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { openUrl } from '@tauri-apps/plugin-opener'
import { invoke } from '../ipc'

export interface SearchHit {
  title: string
  url: string
  snippet: string
}

export interface PageText {
  url: string
  title: string
  text: string
}

// No logging here; callers decide. Rust maps network failures to fixed messages
// ("Couldn't load that page.", "That page took too long to load.") so an error never
// carries the full URL — still, callers log hosts at most, never the URL.
export const webSearch = (query: string, count: number) =>
  invoke<SearchHit[]>('web_search', { query, count })

export const fetchPageText = (url: string) => invoke<PageText>('fetch_page_text', { url })

/** Open a source in the system browser; anything but http(s) is ignored. */
export async function openWebPage(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return
  await openUrl(url)
}
