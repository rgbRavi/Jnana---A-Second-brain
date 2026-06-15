// Small formatting helpers shared across dashboard widgets.

export function relativeTime(ts: number): string {
  if (!ts) return 'never'
  const diff = Date.now() - ts
  if (diff < 0) return 'just now'
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(day / 365)}y ago`
}

export function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Strip media embeds for a clean preview snippet. */
export function preview(content: string, max = 120): string {
  return content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/[#*_>`]/g, '')
    .trim()
    .slice(0, max)
}
