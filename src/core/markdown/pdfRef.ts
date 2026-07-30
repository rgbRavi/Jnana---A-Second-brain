// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { docRefRegex } from './tokenPatterns'

const PDF_EMBED = /!\[pdf\]\(jnana-asset:\/\/([^)]+)\)/g

/** Round to 4 decimals without trailing-zero noise. */
function r4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

/** `[D<index>::p<page>@<x>,<y>]` — index 0-based, page 1-based, x/y normalized 0–1. */
export function buildDocRefToken(index: number, page: number, x: number, y: number): string {
  return `[D${index}::p${page}@${r4(x)},${r4(y)}]`
}

export function parseDocRefToken(token: string): { index: number; page: number; x: number; y: number } | null {
  const m = docRefRegex().exec(token)
  if (!m) return null
  return { index: Number(m[1]), page: Number(m[2]), x: Number(m[3]), y: Number(m[4]) }
}

/** The 0-based nth `![pdf](jnana-asset://…)` filename in note content, or null. */
export function nthPdfFilename(content: string, index: number): string | null {
  const matches = [...content.matchAll(PDF_EMBED)]
  return matches[index]?.[1] ?? null
}
