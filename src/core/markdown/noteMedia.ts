// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure extraction of the media a note embeds — asset embeds (`![image|video|
// audio|pdf](jnana-asset://…)`), web embeds (`![webpage|youtube](url)`), plain
// remote images and document chips (`[External: name](external://path)`) — for
// the right-rail "Attached media" list. Same token shapes the renderers parse.

export type NoteMediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'webpage' | 'youtube' | 'document'

export interface NoteMedia {
  kind: NoteMediaKind
  /** Human label: the image/document name, else the file name or URL. */
  label: string
  /** Where it lives: an asset filename, a URL, or an absolute document path. */
  source: 'asset' | 'url' | 'path'
  target: string
}

const ASSET = 'jnana-asset://'
const EMBED = /!\[([^\]]*)\]\(([^)\s]+)\)/g
const DOC_CHIP = /\[External:\s*([^\]]*)\]\(external:\/\/([^)\s]+)\)/g
const TYPED_ALTS = new Set(['video', 'audio', 'pdf', 'webpage', 'youtube'])

/** Distinct media in document order (a repeated embed is listed once). */
export function extractNoteMedia(content: string): NoteMedia[] {
  const found: { at: number; media: NoteMedia }[] = []

  for (const m of content.matchAll(EMBED)) {
    const [, alt, url] = m
    const isAsset = url.startsWith(ASSET)
    const target = isAsset ? url.slice(ASSET.length) : url
    const kind = (TYPED_ALTS.has(alt) ? alt : 'image') as NoteMediaKind
    const label = kind === 'image' && alt.trim() ? alt.trim() : target
    found.push({ at: m.index ?? 0, media: { kind, label, source: isAsset ? 'asset' : 'url', target } })
  }
  for (const m of content.matchAll(DOC_CHIP)) {
    let path = m[2]
    try {
      path = decodeURIComponent(path)
    } catch {
      /* keep the raw path */
    }
    found.push({ at: m.index ?? 0, media: { kind: 'document', label: m[1].trim() || path, source: 'path', target: path } })
  }

  const seen = new Set<string>()
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => f.media)
    .filter((media) => {
      const key = `${media.source}:${media.target}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
