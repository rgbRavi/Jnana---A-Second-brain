// Truncate a note's markdown to a short preview for card rendering, so a card
// parses (and lays out) only the first screenful instead of the whole note.
// The Notes list renders every visible card at once, and react-markdown parses
// the full body per card — capping the input is the cheapest way to bound that
// cost for long notes. Pure + no CM6/react dep so it's trivially testable.

/** Cut back to the last line break at or before `at`, falling back to the last
 *  space, so we never slice through the middle of a token (`[[wikilink]]`,
 *  `![image](url)`, a heading marker, …). */
function cutBoundary(text: string, at: number): number {
  const nl = text.lastIndexOf('\n', at)
  if (nl > at * 0.5) return nl
  const sp = text.lastIndexOf(' ', at)
  return sp > at * 0.5 ? sp : at
}

/**
 * Return a preview of `content` no longer than ~`maxChars`. If the note already
 * fits, it's returned unchanged. Otherwise it's cut at a line/word boundary, an
 * ellipsis is appended, and — critically — an unbalanced fenced code block is
 * closed so the truncated tail doesn't render the rest of the card as code.
 */
export function truncateMarkdown(content: string, maxChars = 600): string {
  if (content.length <= maxChars) return content

  let out = content.slice(0, cutBoundary(content, maxChars)).trimEnd()

  // A ``` opened but not closed by the cut would swallow everything after it in
  // read-mode; count fence lines and re-close if odd.
  const fences = (out.match(/^```/gm) ?? []).length
  if (fences % 2 === 1) out += '\n```'

  return out + '\n\n…'
}
