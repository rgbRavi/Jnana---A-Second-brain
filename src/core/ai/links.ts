// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/ai/links.ts — pure link parsing for the web quiz (no IO).

const MAX_LINKS = 10

/** Strip a leading `(`/`<` and trailing `.,;:!?>` or an unbalanced `)` (so `…_(language)` survives). */
function trimToken(token: string): string {
  let t = token.replace(/^[(<]+/, '')
  for (;;) {
    const last = t[t.length - 1]
    if (last && '.,;:!?>'.includes(last)) t = t.slice(0, -1)
    else if (last === ')' && t.split(')').length > t.split('(').length) t = t.slice(0, -1)
    else return t
  }
}

/** http(s) URLs from free text (whitespace separated — commas can be part of a URL), deduped, at most 10. */
export function parseLinks(text: string): string[] {
  const out = new Set<string>()
  for (const token of text.split(/\s+/)) {
    if (out.size >= MAX_LINKS) break
    try {
      const url = new URL(trimToken(token))
      if (url.protocol === 'http:' || url.protocol === 'https:') out.add(url.href)
    } catch {
      /* not a URL */
    }
  }
  return [...out]
}
