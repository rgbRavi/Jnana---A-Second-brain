---
target: Graph view
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-11-18T08-31-06Z
slug: src-views-graph
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC). Source-only. Parent verified: useGraph load error console-only (useGraph.ts:47) -> false "No notes" empty state; settings panel unmounted while a note is focused (GV:1488); connect banner --on-accent text on success green; TAG_PALETTE includes accent/warning/success hexes.

## Design Health Score: 26/40, Acceptable (top) — trend 21 -> 26

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 2 | Active filters invisible when panel closed/replaced; load failure silent; structure legend only inside panel |
| 2 | Real world | 3 | Plain labels now; "Label fade" semantics inverted; group syntax undiscoverable |
| 3 | Control | 3 | Esc layering, Undo on create, confirms; presets one-way, active preset unshown |
| 4 | Consistency | 3 | SettingControls + shared ContextMenu; two different "Reset"s (header icon vs Layout text) |
| 5 | Error prevention | 3 | Confirms on disconnect-all and reset; pseudo click creates instantly (Undo only) |
| 6 | Recognition | 2 | Connect/Disconnect/Delete right-click only; anonymous "Colour N" swatches |
| 7 | Flexibility | 3 | Combobox jump, list view, persisted prefs; no keyboard path to node actions |
| 8 | Minimalist | 2 | ~25 panel controls; up to 6 overlays at once; accent-filled Dismiss |
| 9 | Recovery | 2 | Load failure shows "No notes in this vault yet" |
| 10 | Help | 2 | Hints behind ⓘ; pseudo-nodes explained only in hover tooltip |

## Anti-Patterns Verdict
LLM: passes product slop test; calm tool. Toy drift only in opt-in glow + float, and the floating "Right-click a note for more" hint.
Deterministic: detect.mjs 0 findings. Greps clean on native controls, glyphs, outline:none, undefined tokens, !important, hand-rolled Esc. Flags: palette popover absolute inside panel overflow-y:auto (clip/scroll risk, SC:152); palette swatches lack title and have weak "Colour N" names; list toggle aria-label static; console.error instead of log.* (paired with toasts).
False positives: token-mirror fallbacks GV:55-80, TAG_PALETTE/readableOn hexes (user data), ambient ripple durations (reduced-motion guarded), → in toast copy.

## Priority Issues
- [P1] Hidden filter state. Filters change the drawn set but only "Showing X of Y" inside a closed-by-default panel says so; panel unmounts when a note is focused (GV:1488); structure legend in panel only. Fix: badge on settings button + "Filtered · X of Y · Clear" chip; structure legend into bottom-left corner stack. /impeccable clarify, /impeccable layout
- [P1] Silent load failure + double empty state. useGraph swallows errors (useGraph.ts:47) -> false "No notes in this vault yet"; list mode renders graph .empty and list .empty together (both z 2). Fix: expose error, retry state + toast/log.error; one empty state; "New note" action. /impeccable harden
- [P2] Group colour system. 12 swatches incl. accent/warning/success hexes (collide with hub/orphan/connect meaning); light hexes ~1.5-2:1 on light bg; identical row labels; tag chip rainbow unused on canvas. Fix: ~6 named, contrast-checked swatches excluding semantic colours, auto-assign next colour, named rows, neutral/accent tag chips. /impeccable colorize, /impeccable distill
- [P2] Top-edge overlay collisions. Pill/chip centered max 520px overlaps toolbar and is covered by 400px note panel (z4 > z3) incl. its X; pill duplicates note title; connect banner --on-accent on green ~2.7:1; no role=status. Fix: drop pill when note panel open or reflow between toolbar/panel; surface banner with --text-1; ghost Dismiss; live regions. /impeccable layout, /impeccable polish
- [P3] Node actions not keyboard reachable; list view lacks connect/disconnect/delete; small hit targets; right-click hint --text-3. Fix: per-row overflow menu in list (ContextMenu), padded pointer area, hint to --text-2 or one-time tip. /impeccable harden

## Persona Red Flags
Alex: filter text rebuilds forceData + reheats per keystroke; whole view re-renders on hover; no hide-pseudo toggle; presets one-way.
Sam: canvas not keyboard operable, list not at parity; camera glides not reduced-motion gated; slider aria-valuetext raw; identical group labels; banners not live; duplicate ids if multiple GraphViews mount; focus lost when settings panel closes.
Student: one click pans + zooms + dims + opens 400px editor + hides settings; hub/orphan highlight (the "what did I miss" feature) off by default and buried; no auto-fit after settle; exploring pseudo-nodes can litter empty notes; jump matches body but shows titles only.

## Minor Observations
- aria-label counts notes but links include pseudo-links.
- Labels have no halo/backing and no truncation; overlap at medium zoom.
- Pseudo dash near-invisible on light themes.
- Canvas sim keeps running under list view.
- Each GroupColour registers useEscapeKey, so Esc also triggers GraphView's handler.
- Maximize icon reads as fullscreen; RotateCcw reset reads as undo.
- Hover tooltip shows 100-char note preview (screen-share exposure), hardcoded 13px.

## Questions to Consider
- Is a node click for navigating or editing? Would a light neighbour-preview card be calmer than the 400px editor + pill + dim + zoom?
- Should meaning use separate channels: hue for groups only, size for degree, ring for state, dash for missing?
- Would one "Spread" control plus Fit cover students, with physics behind "Tune physics"?
