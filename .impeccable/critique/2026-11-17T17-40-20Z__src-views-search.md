---
target: Search view
total_score: 19
p0_count: 0
p1_count: 2
timestamp: 2026-11-17T17-40-20Z
slug: src-views-search
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC). Source-only.

## Design Health Score: 19/40, Poor (first run)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 2 | Count not aria-live; AI retrieval error swallowed into "No notes matched" (useSemanticSearch.ts:46-47) |
| 2 | Real world | 3 | Raw `0.83` score and "indexed" are developer language |
| 3 | Control | 2 | Clear button exists; no Esc-to-clear |
| 4 | Consistency | 1 | Hand-rolled inline mode tabs (Search.tsx:45-63) instead of ScopeBar's existing `.seg`; result panes 100% inline-styled |
| 5 | Error prevention | 3 | AI input disabled with reason when AI off |
| 6 | Recognition | 2 | No match highlighting; scope not restated in results |
| 7 | Flexibility | 1 | No autofocus, no arrow/Enter result navigation |
| 8 | Minimalist | 2 | Uppercase eyebrow + mono status line + score compete at one tier |
| 9 | Recovery | 1 | Failure indistinguishable from zero results; AI-off has no action |
| 10 | Help | 2 | Good AI placeholder; nothing explains Keyword vs AI |

## Anti-Patterns Verdict
Not visual slop, but fails product slop test: unfinished inline-styled form, two toggle vocabularies side by side.
Deterministic scan: detect.mjs 0 findings on 4 TSX files (inline styles evade it). Supplementary grep caught what the detector missed:
- `outline: 'none'` inline on both inputs (SearchDocs.tsx:82, AiSearchDocs.tsx:50) — beats global `:focus-visible` (main.css:289), so no focus ring. Confirmed.
- `backdrop-filter: blur(8px)` ScopeBar.module.css:19,63 (glass outside `--fx-*`).
- z-index literals 1000/1001 (ScopeBar.module.css:109,114), zIndex 60 inline (ScopeBar.tsx:52,91).
- raw `rgba(0,0,0,0.4)` shadows ScopeBar.tsx:56,95.
- `--border` on input/Clear/tabs (SearchDocs.tsx:76,92; AiSearchDocs.tsx:44,60; Search.tsx:53) instead of `--border-control`.

## Priority Issues
1. [P1] Keyboard + a11y gaps. Inputs kill focus ring; no autofocus; no ArrowDown/Enter into results; count not `role="status"`; ScopeBar menu (ScopeBar.tsx:41-114) lacks aria-haspopup/expanded, Esc, outside-click (CompactScope at :149 has them). Fix: drop inline outline, autofocus, roving-tabindex results, Esc clears, reuse CompactScope menu wiring. Command: harden.
2. [P1] Silent AI failure. useSemanticSearch.ts:46-47 catch sets `[]`; UI says "No notes matched". Fix: `status: 'error'` + inline retry; AI-off state gets "Open AI settings" link. Command: harden.
3. [P2] Component/token drift. Move inline styles to CSS modules; `.seg` for mode toggle; `--border-control`; `--shadow-*`; drop blur; result hover `--surface-hover` (none today). Command: polish.
4. [P2] Results not scannable. No term highlighting, snippet = first 180 chars not around hit, raw score shown (SearchDocs.tsx:189, AiSearchDocs.tsx:140), `toLocaleString` dates, nested 420px scroll inside scrolling view (SearchDocs.tsx:127, AiSearchDocs.tsx:96). Command: clarify + typeset.
5. [P3] Header/scope placement. `.section-label` "Search" eyebrow adds nothing; Source sits apart from the mode/input row it affects. Command: distill.

## Persona Red Flags
- Alex: Tab order Search tabs → ScopeBar → input; input not focused on arrival; no keyboard path from input to results.
- Sam: no focus ring on input; count not announced; "0.83" read aloud; `--text-3` mono ~0.7rem status/date/score likely <4.5:1.
- Student pre-exam: keyword hit with no highlight or context; "AI" tab unexplained; AI-off = dead disabled input; no recents in empty state.

## Minor Observations
- Deleted note silently closes peek (Search.tsx:32).
- Clear button may duplicate native `type="search"` clear glyph.
- `title=` on disabled Workspace item (ScopeBar.tsx:71) may never show.
- 📁 emoji fallback (ScopeBar.tsx:108) clashes with lucide icons.

## Questions
- One search box with meaning-based fallback when keyword results are thin, instead of two tabs?
- Split preview pane on arrow keys instead of modal peek?
- Why not "12 results in Biology 101" as the results header?
