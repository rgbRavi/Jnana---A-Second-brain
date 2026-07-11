// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Syntax-highlighting seam for fenced code blocks. Deferred for now — no
// highlighter dependency is bundled, so fenced code renders as plain styled
// monospace text (see CodeBlock in MarkdownLite.tsx).
//
// To add highlighting later: gate it behind a setting, then lazily
// `await import('shiki')` (or another highlighter) inside this function and
// return its rendered HTML. CodeBlock already calls this and falls back to
// plain text whenever it resolves to `null`, so no caller changes are needed.

/** Returns highlighted HTML for `code`, or `null` if no highlighter is wired up. */
export async function highlightCode(_code: string, _lang: string | undefined): Promise<string | null> {
  return null
}
