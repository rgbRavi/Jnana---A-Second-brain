// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Note } from '../types'
import { getMediaTypes } from './media';
import { TABLE_BLOCK } from './table';

const AUTO_TAG_PREFIXES = ['has:', 'long-form']

/** Returns true for auto-generated system tags (has:*, long-form) */
export function isAutoTag(tag: string): boolean {
    return AUTO_TAG_PREFIXES.some((p) => tag.startsWith(p))
}

async function getAttachedMediaTypes(noteID: string): Promise<Set<string>> {
    const types = await getMediaTypes(noteID);
    return new Set(types);
}

export async function inferTags(note: Note): Promise<string[]> {
    const tags: string[] = [];
    const content = note.content;

    // ── Media-based tags (from DB) ────────────────────────────────
    const mediaTypes = await getAttachedMediaTypes(note.id);

    if (mediaTypes.size > 0)               tags.push('has:media');
    if (mediaTypes.has('image'))           tags.push('has:image');
    if (mediaTypes.has('video'))           tags.push('has:video');
    if (mediaTypes.has('youtube'))         tags.push('has:youtube');
    if (mediaTypes.has('audio'))           tags.push('has:audio');
    if (mediaTypes.has('pdf'))             tags.push('has:pdf');

    if (mediaTypes.has('video') || mediaTypes.has('youtube')) tags.push('has:videoOrYt');

    // ── Content-based tags (regex on note text) ───────────────────
    if (/!\[webpage\]\(/.test(content))     tags.push('has:webpage');
    if (/https?:\/\//.test(content))        tags.push('has:link');
    if (/\[\[.*?\]\]/.test(content))        tags.push('has:wikilink');
    if (/\(external:\/\//.test(content)) tags.push('has:docxlink');
    // TABLE_BLOCK is a global regex — reset lastIndex so a prior match doesn't skip.
    TABLE_BLOCK.lastIndex = 0;
    if (TABLE_BLOCK.test(content))          tags.push('has:table');

    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 1000)                   tags.push('long-form');

    return tags;
}