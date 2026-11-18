---
target: Graph view
total_score: 21
p0_count: 0
p1_count: 2
timestamp: 2026-11-18T07-12-39Z
slug: src-views-graph
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC). Source-only. Parent verified: ask() at GV:959, console.error-only catches GV:904/948, unguarded disconnectAll GV:1836-1845, onMouseDown-only JumpToNote GV:474, ctx.font var() GV:1360, click-to-focus zoom(4) GV:1014-1022.

## Design Health Score: 21/40, Acceptable (low)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 2 | Bare "Loading graph…" text (GV:1188); empty filter result only shows "0 of N" inside collapsed Filters; connect/disconnect give no feedback |
| 2 | Real world | 3 | Orphans/Hubs/Repel/Forces jargon; "Animate" really means reheat + fit |
| 3 | Control | 2 | "Disconnect all links" rewrites every linked note, no confirm, no undo (GV:1836-1845) |
| 4 | Consistency | 1 | Native Tauri ask() (GV:959), native select/range/color (GV:1528/393/1594), "›" glyph chevron (GV:307), hand-rolled Esc (GV:645), --surface-2 hover (GV:1950), --border toggle track (GV:1343) |
| 5 | Error prevention | 2 | Bulk disconnect unguarded; untitled-target connect is guarded (GV:908) |
| 6 | Recognition | 2 | Right-click, click-to-focus, click-dashed-to-create all invisible; faint 0.72rem hint (GV:1253) |
| 7 | Flexibility | 2 | Jump-to-note exists but is not keyboard-completable; no fit-view, no shortcuts |
| 8 | Minimalist | 2 | Panel open by default (GV:565), 12+ controls, slider text shown twice (hint + title), "Hover a slider for details" under visible details (GV:1698) |
| 9 | Recovery | 1 | Connect/disconnect failures only console.error (GV:904, 948) |
| 10 | Help | 1 | Nothing explains pseudo-nodes or why a click hides the graph |

## Anti-Patterns Verdict
LLM: not AI-SaaS slop; Obsidian-graph skeleton is recognisable. Trust breaks at the native OS dialog, toy ambience toggles ("Glowing background", "Keep nodes moving"), and a hand-built control panel that ignores SettingControls.
Deterministic: detect.mjs 0 findings. Greps: native ask() dialog (GV:8, 959); 3 silent write failures; inline `outline:'none'` on shared inputStyle (GV:264) kills global focus ring on filter/jump inputs; native <select> GV:1528, range GV:393; "›" chevron GV:307; hand-rolled Escape listener GV:645-649; hardcoded '#fff' chip text GV:1557; literal 0.15s inline transitions (GV:305/345/358) bypass --dur-*/--motion-scale.
False positives: token-mirror fallbacks GV:50-80 (re-read on theme:changed), --bg fallback GV:595/599, transparent rgba GV:1480, ambient 15s/21s ripple loops (reduced-motion handled), context-menu scrim div GV:1786.

## Priority Issues
- [P1] Native dialog + silent write failures. ask() for pseudo-node create (GV:959); connect/disconnect catch only console.error (GV:904, 948); disconnect-all unconfirmed. Fix: showConfirmDialog (or create directly + toast with Undo), toast.error + early return, success toasts, confirm disconnect-all naming the note count. /impeccable harden
- [P1] Keyboard/screen-reader access near zero. Canvas unlabeled; JumpToNote results onMouseDown-only (GV:474) and blur closes list (GV:444); context menu no role=menu/focus/arrows; inline outline:none on inputs (GV:264). Fix: combobox/listbox with Enter + arrows, drop outline:none, shared menu component, useEscapeKey, aria-label on canvas, accessible list alternative. /impeccable harden, /impeccable adapt
- [P2] Click-to-focus removes the graph. Click filters to 1-hop + zoom(4) (GV:1014-1022); hover highlights only the node. Fix: dim non-neighbours, hover-neighbour highlight, explicit "neighbourhood only" toggle, Fit-view icon button replacing accent "Animate", on-canvas exit pill. /impeccable clarify, /impeccable polish
- [P2] Canvas legibility. ctx.font uses var(--font-body) (GV:1360) — invalid in canvas, assignment likely ignored, so user font lost and label sizing reverts to default; default node fill --text-3 ~2.5:1 on bg; pseudo labels 0.55 alpha; '#fff' on light chips (GV:1557); group meaning colour-only. Fix: resolve font family string in readGraphColors, raise node/label contrast, luminance-based chip text, on-canvas group legend. /impeccable colorize, /impeccable typeset
- [P3] Settings panel is a bespoke mini-app. Open by default, Reset/Close crammed in Filters header (GV:1507-1516), duplicate hint+title text, native controls, toy ambience toggles, all inline styles. Fix: default closed, SettingToggle/SettingSlider/SettingSelect, lucide ChevronRight, one copy of help text, Forces + ambience behind Advanced, styles into CSS module. /impeccable distill, /impeccable quieter

## Persona Red Flags
Alex: no shortcuts for focus/fit/connect; connect = right-click then click, no drag-to-link; every force slider reheats sim.
Sam: canvas inert to keyboard/SR; JumpToNote not keyboard-completable; mouse-only menu; no focus ring on inputs; colour-only encoding; hit area ignores Node size slider (no nodePointerAreaPaint).
Student mid-term: clicking a note hides everything else (opposite of "how does this connect"); jargon; first dashed-node click spawns an OS popup; no sign a connect worked; tag chips (most useful control) buried in collapsed Filters.

## Minor Observations
- presetBtnStyle reused for Clear filters / Add group / Reset — three roles, one look.
- Delete item and Back chevron hand-drawn SVG while rest uses lucide (GV:1855, 1911).
- Empty state is generic .note-empty text, no CTA (GV:1195).
- nodeLabel HTML tooltip (GV:1270-1282) differs from global themed tooltip.
- groupColorFor loops all groups per node per frame (GV:717-732, 1399); cost on big vaults.
- Hard-coded 20px / 0.72rem instead of spacing tokens; z-index 20 literal (css:73).

## Questions to Consider
- If a student does one thing here, is it "find a note I forgot to connect" or "tune physics"? UI weights both equally.
- Should connect/disconnect live in the note panel, leaving the canvas read-mostly and keyboard-equivalent?
- Are unresolved [[Title]]s better as a "Missing notes" list beside the canvas than as click-to-create dots?
