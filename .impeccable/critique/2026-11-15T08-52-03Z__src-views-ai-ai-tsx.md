---
target: AI view
total_score: 29
p0_count: 0
p1_count: 0
timestamp: 2026-11-15T08-52-03Z
slug: src-views-ai-ai-tsx
---
⚠️ DEGRADED: single-context (sub-agents not requested for this run; Tauri app not browser-inspectable)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Status line + "What the AI sees" make the next send legible; Recent chats still filters to the active project silently |
| 2 | Match System / Real World | 3 | Layers now have plain names; "Focused"/"Capabilities" still insider words |
| 3 | User Control and Freedom | 3 | Back buttons everywhere; deletes confirmed but not undoable |
| 4 | Consistency and Standards | 2 | Glowing primaries, uppercase tracked labels in sidebar + project form, "Project Settings" vs project name, per-button inline styles |
| 5 | Error Prevention | 3 | Vault/project mix-up fixed; confirms on destructive actions |
| 6 | Recognition Rather Than Recall | 3 | "Focused" link + layer panel; sidebar rename/delete still right-click only |
| 7 | Flexibility and Efficiency | 3 | Bulk delete, search, auto-hide; no shortcuts for new chat/search |
| 8 | Aesthetic and Minimalist Design | 3 | Header row and scope bar gone; sidebar stacks 4 rows before the list |
| 9 | Error Recovery | 3 | Plain toasts; partial failures counted |
| 10 | Help and Documentation | 3 | "What the AI sees" is real contextual help |
| **Total** | | **29/40** | **Good** |

## Anti-Patterns Verdict
LLM: product-register familiar; remaining tells are decorative — accent glow on New chat/Send (Ai.module.css:168,184), uppercase tracked "RECENT CHATS" (ChatHistory.tsx:248) and six uppercase field labels (ProjectsView.tsx:281-360).
Deterministic: 8 findings (down from 12) — layout-transition ×4 (FreeChat.tsx:1234,1491,1498; Suggestions.module.css:86), off-token radius ×2, color ×1, font-size ×1 all in Suggestions.module.css. ProjectsView findings cleared.

## Priority Issues
1. [P2] Visual vocabulary drift — glowing primaries, uppercase eyebrow/labels, inline-styled buttons each re-declaring borders/colours. Fix: drop glow (flat accent + hover), sentence-case labels at text-2 weight 600, shared button classes in Ai.module.css. → /impeccable quieter, /impeccable polish
2. [P2] Project form labels aren't bound to inputs (`<label>` without htmlFor, ProjectsView.tsx:281-360); fields named only by placeholder. Fix: htmlFor/id pairs. → /impeccable audit
3. [P2] Recent chats silently scoped to the active project (no indicator). Fix: "In ENI ×" chip above the list that clears the project filter. → /impeccable clarify
4. [P2] Sidebar stack: controls row, New chat, Chats, Projects, "Recent chats" heading before any chat; "Chats" and "Recent chats" overlap in meaning. Fix: drop the heading or merge into the Chats row ("Chats · see all"). → /impeccable distill
5. [P3] Project detail header reads "Project Settings" instead of the project's name. → /impeccable clarify

## Persona Red Flags
Jordan: "Capabilities" icon menu still mixes four instruction types; the new layer panel explains them only after opening it.
Sam: project form fields unlabeled for screen readers; sidebar chat actions need the Menu key.
Alex: no shortcut for New chat / chat search.

## Minor Observations
- max-width transitions reflow chat text (FreeChat.tsx).
- "Last message 2h ago" (Chats page) vs "2h ago" (sidebar).
- Suggestions.module.css off-token values.

## Questions to Consider
- Does the sidebar need both a "Chats" link and a "Recent chats" heading?
- Should the Send/New chat buttons glow when nothing else in the app does?
