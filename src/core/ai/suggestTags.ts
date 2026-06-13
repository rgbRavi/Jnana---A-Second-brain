import type { AiConfig, Note, TagSuggestion } from '../../types'
import { isAutoTag } from '../tags'
import { getChatProvider } from './provider'

const SYSTEM_PROMPT = `You tag a personal knowledge note. PREFER tags from the user's existing
tag list; only propose a NEW tag when none of the existing ones fit and it's clearly warranted by
the note's content. Suggest 3–7 concise, lowercase, hyphenated topic tags. Do not use outside
facts. Respond with ONLY a JSON array and nothing else:
[{"tag": "machine-learning", "reason": "one short clause on why"}]`

/** Tolerantly pull a JSON array of {tag, reason} from a model response. */
function parseTags(raw: string): { tag: string; reason: string }[] {
  let text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1)

  const arr = JSON.parse(text) as unknown
  if (!Array.isArray(arr)) return []
  return arr
    .map((x) => {
      const item = x as Record<string, unknown>
      const tag = typeof item.tag === 'string' ? item.tag.trim().toLowerCase().replace(/\s+/g, '-') : ''
      const reason = typeof item.reason === 'string' ? item.reason : ''
      return { tag, reason }
    })
    .filter((x) => x.tag)
}

/**
 * Suggest tags for a note, grounded in its content and the user's existing tag
 * vocabulary. `isNew` is computed here (not trusted from the model) by checking
 * the vocabulary, so the UI can show existing tags before genuinely new ones.
 * Auto-tags (`has:*`, `long-form`) are never suggested. Pure suggestion — the
 * caller decides what (if anything) to apply.
 */
export async function suggestTags(
  note: Note,
  config: AiConfig,
  existingTags: string[],
): Promise<TagSuggestion[]> {
  const provider = getChatProvider(config)
  const vocab = existingTags.length ? existingTags.join(', ') : '(none yet)'
  const prompt = `Existing tags: ${vocab}\n\nNote title: ${note.title?.trim() || 'Untitled'}\n\nNote content:\n${(note.content || '').slice(0, 4000)}`

  const raw = await provider.complete(prompt, { system: SYSTEM_PROMPT, temperature: 0.2 })

  const vocabSet = new Set(existingTags.map((t) => t.toLowerCase()))
  const seen = new Set<string>()
  const out: TagSuggestion[] = []
  for (const { tag, reason } of parseTags(raw)) {
    if (seen.has(tag) || isAutoTag(tag)) continue
    seen.add(tag)
    out.push({ tag, reason, isNew: !vocabSet.has(tag) })
  }
  // Existing-vocabulary tags first, then proposed-new ones.
  return out.sort((a, b) => Number(a.isNew) - Number(b.isNew))
}
