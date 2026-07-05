// Shared regex *sources* for Jnana's custom note tokens — wikilinks and
// timestamps — consumed by both the read-mode remark plugin (remarkJnana.ts)
// and the live editor's lezer extension (lezerJnana.ts), so the two parsers
// can never silently diverge on what counts as a token.
//
// Exported as sources + factories rather than shared regex instances: a
// regex with the `g` flag carries mutable `lastIndex` state, so handing the
// same instance to two independent consumers risks cross-contaminating
// matches (e.g. one parser's in-progress scan resetting the other's).

export const WIKILINK_SOURCE = '\\[\\[(.*?)\\]\\]'
export const VIDEO_TIMESTAMP_SOURCE = '\\[V(\\d+)::(\\d{2}:\\d{2}:\\d{2})\\]'
export const AUDIO_TIMESTAMP_SOURCE = '\\[A(\\d+)::(\\d{2}:\\d{2}:\\d{2})\\]'
export const SIMPLE_TIMESTAMP_SOURCE = '\\[(\\d{1,2}:\\d{2}(?::\\d{2})?)\\]'

/** A fresh global-flagged regex per call, for scanning an entire text node (remark). */
export const wikilinkRegex = (): RegExp => new RegExp(WIKILINK_SOURCE, 'g')
export const videoTimestampRegex = (): RegExp => new RegExp(VIDEO_TIMESTAMP_SOURCE, 'g')
export const audioTimestampRegex = (): RegExp => new RegExp(AUDIO_TIMESTAMP_SOURCE, 'g')
export const simpleTimestampRegex = (): RegExp => new RegExp(SIMPLE_TIMESTAMP_SOURCE, 'g')

/** A fresh start-anchored regex per call, for matching at a specific position (lezer). */
export const wikilinkAnchored = (): RegExp => new RegExp('^' + WIKILINK_SOURCE)
export const videoTimestampAnchored = (): RegExp => new RegExp('^' + VIDEO_TIMESTAMP_SOURCE)
export const audioTimestampAnchored = (): RegExp => new RegExp('^' + AUDIO_TIMESTAMP_SOURCE)
export const simpleTimestampAnchored = (): RegExp => new RegExp('^' + SIMPLE_TIMESTAMP_SOURCE)
