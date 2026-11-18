---
target: Graph view
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-11-18T14-10-38Z
slug: src-views-graph
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC). Source-only. Parent verified: three "unlinked" controls (Filters toggle GSP:482, Display toggle GSP:536, ⋯ item GMM:73); two unstyled native-looking Cancel buttons in list-mode pickers (GV:1779, 1797); below 900px the note panel (z5) fully covers the settings panel (z4) by design.

## Design Health Score: 26/40, Acceptable — trend 21 -> 26 -> 26 -> 26

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | Chips + live region good; spotlight state only visible as a tick inside ⋯ |
| 2 | Real world | 3 | "Link pull", "Centering", "Spacing" are physics vocabulary |
| 3 | Control | 3 | Esc layering + Clear everywhere |
| 4 | Consistency | 2 | One concept (unlinked) across three controls with different effects |
| 5 | Error prevention | 3 | Confirms; NaN guards |
| 6 | Recognition | 2 | Path / connect / suggestions behind right-click or unlabeled ⋯; tip is one-time |
| 7 | Flexibility | 3 | Keyboard cursor, jump, list, saved views |
| 8 | Minimalist | 2 | Settings ~25 controls; chips + legends + timeline can all show |
| 9 | Recovery | 3 | Retry on load failure; AI-off chip lacks a link to Settings |
| 10 | Help | 2 | Nothing explains clusters, depth, fill vs ring beyond the legend |

## Anti-Patterns Verdict
LLM: not slop; risk is accretion. Fill = group/cluster, rings = state is a coherent grammar.
Deterministic: detect.mjs 0 findings over 5003 lines. Greps clean (no undefined tokens, native controls, glyphs, dialogs, console, hardcoded ids; all timers/observers cleaned). Notes: ContextMenu global Esc listener (shared, pre-existing); unstyled Cancel buttons; magic px sizes (toolbar 36px, popup 240/280px, badge 6px).
False positives: token fallbacks overwritten by readGraphColors, palette hexes (user data), local custom properties.

## Priority Issues
- [P1] Narrow widths: note panel covers settings with no cue. Fix: replace (close settings, restore after) or a visible tab. /impeccable adapt
- [P1] Power features hidden (path/connect/suggest only via right-click or unlabeled ⋯; one-time tip). Fix: "Find path…" entry in ⋯ with hint, persistent "?" / shortcuts, label the ⋯. /impeccable clarify
- [P2] One concept, three controls (unlinked: ⋯ spotlight, Display highlight, Filters only-toggle) + legend restating it. Fix: spotlight in ⋯ + filter in Filters; Display toggle only for well-linked size; shorter legend. /impeccable distill
- [P2] Large-vault cost: per-node gradient + Date.now halo with continuous repaint, unvirtualized list view, blurred ripple layers. Fix: cache colours, cap halo/ripple above N nodes, virtualize list. /impeccable optimize
- [P3] Chips + legends crowd 800×600; unstyled Cancel buttons in list pickers. Fix: collapse multiple chips to one status line; use statusChipBtn. /impeccable layout

## Persona Red Flags
Alex: no keyboard route into path/connect; no shortcut for settings/timeline; saved views not cyclable.
Sam: meaning in dashed vs solid rings (legend names them); legend swatches aria-hidden (text carries it).
Student: won't find path or depth; "Link pull"/"Centering" meaningless; Advanced visible but safe to ignore.

## Questions to Consider
- What would the graph be with only filter, group and depth visible, everything else on demand?
- Two named layouts (spread / compact) instead of four physics sliders?
- Should path/connect leave the right-click menu for a visible home?
