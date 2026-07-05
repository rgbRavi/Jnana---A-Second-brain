// The slash-command registry + detection, kept pure (no CM6/React deps) so the
// menu is unit-testable and LiveEditor only has to map an `action` onto the
// imperative helper it already owns. The `/query` is real document text — see
// LiveEditor's slash wiring — so detection just reads the current line.

import type { FormatKind } from './format'

/** Where a slash-insert command routes: reuse LiveEditor's existing helpers. */
export type ImportWhich = 'image' | 'video' | 'audio' | 'document' | 'youtube' | 'webpage'

export type SlashAction =
  | { kind: 'format'; format: FormatKind }
  | { kind: 'insert'; markdown: string }
  | { kind: 'import'; which: ImportWhich }
  // Insert `[[]]` and open the note-picker between the brackets.
  | { kind: 'wikilink' }

export interface SlashCommand {
  id: string
  label: string
  icon: string
  /** Extra match terms beyond the label (e.g. 'h1' for Heading 1). */
  keywords: string[]
  group: 'Format' | 'Insert'
  action: SlashAction
}

/** Declarative registry — group order here is the display + filter order. */
export const SLASH_COMMANDS: SlashCommand[] = [
  // Format
  { id: 'h1', label: 'Heading 1', icon: 'H1', keywords: ['heading', 'title', 'h1'], group: 'Format', action: { kind: 'format', format: 'h1' } },
  { id: 'h2', label: 'Heading 2', icon: 'H2', keywords: ['heading', 'subtitle', 'h2'], group: 'Format', action: { kind: 'format', format: 'h2' } },
  { id: 'ul', label: 'Bullet list', icon: '•', keywords: ['bullet', 'unordered', 'list', 'ul'], group: 'Format', action: { kind: 'format', format: 'ul' } },
  { id: 'ol', label: 'Numbered list', icon: '1.', keywords: ['numbered', 'ordered', 'list', 'ol'], group: 'Format', action: { kind: 'format', format: 'ol' } },
  { id: 'quote', label: 'Quote', icon: '❝', keywords: ['blockquote', 'quote'], group: 'Format', action: { kind: 'format', format: 'quote' } },
  { id: 'codeblock', label: 'Code block', icon: '{ }', keywords: ['code', 'fence', 'block'], group: 'Format', action: { kind: 'format', format: 'codeblock' } },
  { id: 'bold', label: 'Bold', icon: 'B', keywords: ['strong', 'bold'], group: 'Format', action: { kind: 'format', format: 'bold' } },
  { id: 'italic', label: 'Italic', icon: 'I', keywords: ['emphasis', 'italic'], group: 'Format', action: { kind: 'format', format: 'italic' } },
  { id: 'code', label: 'Inline code', icon: '`', keywords: ['code', 'monospace', 'inline'], group: 'Format', action: { kind: 'format', format: 'code' } },

  // Insert
  { id: 'wikilink', label: 'Link to note', icon: '🔗', keywords: ['link', 'wikilink', 'note', 'connect', 'reference'], group: 'Insert', action: { kind: 'wikilink' } },
  { id: 'divider', label: 'Divider', icon: '―', keywords: ['divider', 'rule', 'separator', 'hr'], group: 'Insert', action: { kind: 'insert', markdown: '\n\n---\n\n' } },
  { id: 'image', label: 'Image', icon: '📷', keywords: ['image', 'picture', 'photo'], group: 'Insert', action: { kind: 'import', which: 'image' } },
  { id: 'video', label: 'Video', icon: '🎬', keywords: ['video', 'movie', 'clip'], group: 'Insert', action: { kind: 'import', which: 'video' } },
  { id: 'audio', label: 'Audio', icon: '🎵', keywords: ['audio', 'sound', 'music'], group: 'Insert', action: { kind: 'import', which: 'audio' } },
  { id: 'document', label: 'Document / File', icon: '📄', keywords: ['document', 'file', 'pdf', 'doc'], group: 'Insert', action: { kind: 'import', which: 'document' } },
  { id: 'youtube', label: 'YouTube embed', icon: '▶️', keywords: ['youtube', 'video', 'embed'], group: 'Insert', action: { kind: 'import', which: 'youtube' } },
  { id: 'webpage', label: 'Web page', icon: '🌐', keywords: ['web', 'page', 'link', 'url', 'bookmark'], group: 'Insert', action: { kind: 'import', which: 'webpage' } },
]

/**
 * Detect an active slash context at `cursor`. Returns the `/`'s document offset
 * and the query typed after it, or null. A context is active only when the `/`
 * is at line start or preceded by whitespace and the run after it (up to the
 * cursor) has no whitespace — so `http://…` and mid-word `/` never trigger.
 * The caller is responsible for having verified the selection is empty.
 */
export function detectSlashContext(doc: string, cursor: number): { from: number; query: string } | null {
  if (cursor < 1 || cursor > doc.length) return null
  // Walk back from the cursor over non-whitespace to find the run's start.
  let i = cursor
  while (i > 0 && !/\s/.test(doc[i - 1])) i--
  // `i` is the start of the current word-run; it must begin with `/`.
  if (doc[i] !== '/') return null
  // The char before `/` must be start-of-doc, a newline, or whitespace.
  if (i > 0 && !/\s/.test(doc[i - 1])) return null
  return { from: i, query: doc.slice(i + 1, cursor) }
}

/**
 * Filter the registry by a case-insensitive match over label + keywords,
 * preserving the registry's group/definition order. An empty query returns all.
 */
export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (c) => c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.toLowerCase().includes(q)),
  )
}
