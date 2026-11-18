---
target: Graph view
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-11-18T11-55-58Z
slug: src-views-graph
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC). Source-only. Parent verified: HUB_COLOR = FOCUS_COLOR = accent (GV:101-102); Esc closes timeline before a pending connect/path (GV:548-549); timeline shows two counters (TimelineBar.tsx:62-64 — slider "v of steps" vs label "shown of total notes").

## Design Health Score: 26/40, Acceptable — trend 21 -> 26 -> 26

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | role=status chips + aria-live; up to 5 status surfaces at once; timeline double counter |
| 2 | Real world | 3 | Student copy good; "Neighbourhood", "Directed" still jargon |
| 3 | Control | 3 | Esc layering good; timeline closes before a pending connect/path |
| 4 | Consistency | 2 | Chip family inconsistent (connectBanner / spotlightChip / filterChip / timeline: different radius, surface, shadow, verbs) |
| 5 | Error prevention | 3 | Confirms on overwrite/reset |
| 6 | Recognition | 2 | Path/connect/keyboard nav hidden behind right-click or keys; one permanent hint |
| 7 | Flexibility | 3 | Keyboard cursor, jump, saved views |
| 8 | Minimalist | 2 | Six screen regions occupied once 2-3 features are on |
| 9 | Recovery | 3 | Good failure copy |
| 10 | Help | 2 | No discoverable explanation for path finding etc. |

## Anti-Patterns Verdict
LLM: passes slop test; risk is accretion — independent overlays without a shared status system.
Deterministic: detect.mjs 0 findings. Greps clean (tokens, native controls, glyphs, dialogs, console, invoke, side-stripes, !important, timers cleaned). Notes: same-z siblings (.openPanelBtn/.panel/.notePanel at 4; .toolbar/.filterChip at 3); hardcoded ids graph-missing-h / graph-list-hint.
False positives: token-mirror fallbacks, palette hexes (user data), copy arrows, scoped Esc handlers, decorative loops.

## Priority Issues
- [P1] Status chips are not one system: connect/path banner, path chip, spotlight chip, filter chip, timeline all styled differently, mixed Dismiss/Clear. Fix: one .statusChip pattern + one verb, single stack, filter chip joins it. /impeccable distill, /impeccable polish
- [P1] Colour semantics collide: hub = focus = path fill (accent); path overrides cluster/group fill; no path legend; colour-only cues. Fix: hub mark by ring/size, path as stroke keeping fill, endpoint marks, Path legend row. /impeccable colorize, /impeccable harden
- [P2] Timeline competes: two denominators, Esc order closes timeline before pending connect/path, magic 52px lift, overflow at ~700px. Fix: one counter, Esc order, CSS-var height. /impeccable clarify, /impeccable polish
- [P2] Discoverability: power features only via right-click/hidden keys; ⋯ toggles have no checked state; permanent floating hint. Fix: checkmarks, first-use hint, shortcuts line in panel. /impeccable onboard
- [P3] Note panel and settings panel fight for top-right; settings unmounts on node click. Fix: dock note panel beside settings or restore on close. /impeccable adapt

## Persona Red Flags
Alex: saved view = 3 clicks; rename/delete via picker dialogs; no visible key hints.
Sam: colour-only states; Esc can cancel the wrong layer; ring contrast unverified on light themes.
Student: must pick "Colour by" before meaning appears; no "what next" after highlighting unlinked notes.

## Minor Observations
- GraphView.tsx 2112 lines; overlay accretion hard to reason about.
- Magic offsets (52px, 220px, 10.5rem).
- "Right-click a note for more" permanent, no dismiss.

## Questions to Consider
- Which single meaning earns node colour: group, cluster, path, structure or selection?
- Should timeline be a filter in settings rather than a mode with its own bar?
- Do path-finding and saved views belong in the graph, or in list/search?
