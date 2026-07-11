// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'

/** Open-Graph / title metadata for an embedded web page (fetched + cached Rust-side). */
export interface LinkPreview {
  url: string
  title: string
  description: string
  image: string
  favicon: string
  siteName: string
}

export function fetchLinkPreview(url: string): Promise<LinkPreview> {
  return invoke<LinkPreview>('fetch_link_preview', { url })
}

/** Best-effort hostname for display, tolerating malformed URLs. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
