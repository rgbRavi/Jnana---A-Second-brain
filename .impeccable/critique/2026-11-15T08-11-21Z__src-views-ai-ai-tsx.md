---
target: AI view
total_score: 25
p0_count: 0
p1_count: 4
timestamp: 2026-11-15T08-11-21Z
slug: src-views-ai-ai-tsx
---
⚠️ DEGRADED: single-context (sub-agents not authorized this session; browser inspection unavailable — Tauri app, no web-reachable surface)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | ModeLine states what Send does; but "SOURCE: Entire vault" contradicts it in plain Chat |
| 2 | Match System / Real World | 2 | Focused, Capabilities, Rules vs Skills vs Response style vs Conversation instructions: insider vocabulary |
| 3 | User Control and Freedom | 3 | Back buttons, Esc, confirms present; delete is irreversible (no undo) |
| 4 | Consistency and Standards | 2 | 3 button vocabularies, "AI Projects"/"Projects"/"Project Settings", uppercase eyebrows in some places only |
| 5 | Error Prevention | 3 | Confirmed deletes; vault-scoping fixed; silent project filter on Recent chats still misleads |
| 6 | Recognition Rather Than Recall | 2 | Icon-only composer; ModeLine names "Focused" which has no visible label; rename/delete right-click only in sidebar |
| 7 | Flexibility and Efficiency | 3 | Bulk delete, search, context menus, auto-hide; no shortcuts for new chat / search |
| 8 | Aesthetic and Minimalist Design | 2 | ~9 chrome zones around one composer; glowing primary buttons |
| 9 | Error Recovery | 3 | Plain-language toasts; partial bulk-delete failures reported |
| 10 | Help and Documentation | 2 | Tooltips only; nothing explains how instruction layers combine |
| **Total** | | **25/40** | **Acceptable** |

## Anti-Patterns Verdict
LLM: not AI slop in the brand sense; product-register familiarity (Claude-like layout). Strangeness without purpose: accent glow on New chat/Send (box-shadow 18px accent), uppercase tracked "RECENT CHATS" eyebrow and uppercase form labels, card grid of identical project cards.
Deterministic scan: 12 findings — layout-transition ×4 (max-width transitions FreeChat.tsx:1204,1461,1468; Suggestions.module.css:86), design-system-radius ×4 (ProjectsView.tsx:224,287 8px; Suggestions.module.css:26,55 0.5rem), design-system-color ×2 (ProjectsView.tsx:360 rgba(0,0,0,.4); Suggestions.module.css:107), design-system-font-size ×2 (ProjectsView.tsx:425 1rem; Suggestions.module.css:169 0.6rem). All real, all minor. The detector missed every IA/copy problem below; the review missed the off-token values.

## Priority Issues
1. [P1] Six instruction layers, no model of how they combine — global/preset system prompt, project Custom Instructions, Conversation instructions, Rules, Skills, Response style. Users can't predict what the model is told. Fix: one "What the AI sees" panel (expand the ModeLine) listing active layers in order; plain names; fold Conversation instructions into the chat title menu. → /impeccable clarify, /impeccable distill
2. [P1] "SOURCE: Entire vault" bar sits over plain Chat, which "won't search your notes". Contradiction at the top of the screen. Fix: show scope only when a grounded action (Focused/Ask/Agent) is armed, inside the composer/ModeLine. → /impeccable distill
3. [P1] Project cards are `<div onClick>` (ProjectsView.tsx) — not focusable, keyboard users can't open a project; hover styles via onMouseEnter only. Fix: buttons/links, :hover/:focus-visible in CSS. → /impeccable audit
4. [P1] Icon-only composer + ModeLine copy "use Focused to ground a reply" names a control with no visible label (Sparkles icon). Fix: make "Focused" in the ModeLine a button that opens the Focused menu, or keep Focused labelled. → /impeccable clarify
5. [P2] Inconsistent vocabulary: back buttons styled three ways, glowing primaries vs flat, "AI Projects"/"Projects", detail header "Project Settings" instead of the project name, Recent chats silently filtered to the active project (no chip). Fix: shared button classes, project name as title, "In ENI ×" filter chip. → /impeccable polish

## Persona Red Flags
Jordan (first-timer): toolbar is four unlabeled icons; ModeLine says "Focused" with no matching label; Capabilities offers Rules, Skills, Response style, Conversation instructions with no explanation of difference.
Sam (keyboard/screen reader): project cards unreachable by keyboard; row hover highlight in ChatsView/ProjectsView via JS mouse events only (no focus equivalent); hover-reveal rails do open on Tab (good).
Alex (power user): no shortcut for New chat or focusing chat search; rename/delete in sidebar require right-click; bulk delete exists only on the Chats page.

## Minor Observations
- Header model label shows raw provider id uppercased in mono ("OPENAI · DEEPSEEK/…") — hard to read; use preset name.
- "Last message 2h ago" vs sidebar "2h ago": two phrasings of the same fact.
- max-width transitions on the chat column reflow text while the sidebar animates.
- Starter card copy "review the settings, then press Quiz me" explains a two-step flow the button could just do.

## Questions to Consider
- Does plain Chat need a scope bar at all?
- Could "instructions" be one concept with layers shown, rather than five menu items?
- What if the empty state taught the composer icons instead of three starter cards?
