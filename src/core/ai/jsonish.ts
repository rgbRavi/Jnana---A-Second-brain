// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/ai/jsonish.ts
//
// Models wrap JSON in fences and chat around it however the mood takes them.
// One tolerant extractor, shared by every grounded generator that asks for an
// array back, instead of a copy per feature.

/** Strip fences/prose down to the outermost JSON array. Returns the input trimmed
 *  when no array is present — the caller's JSON.parse then fails as usual. */
export function extractJsonArray(raw: string): string {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return text
  return text.slice(start, end + 1)
}
