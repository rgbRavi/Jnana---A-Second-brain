---
target: Home dashboard
total_score: 27
p0_count: 0
p1_count: 2
timestamp: 2026-11-18T06-38-59Z
slug: src-views-home-dashboard
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC). Source-only; built-in default layout. Parent verified A's key claims (rgHandle_e over scrollbar, dead .resizeHandle, unnamed Rename/Delete).

## Design Health Score: 27/40, Acceptable (top), trend 21 → 26 → 27

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | Skeletons, refresh spinner, named partial-failure notice with retry; a widget that failed still shows friendly empty copy |
| 2 | Real world | 3 | "Pick up where you left off" good; "Not searchable by AI yet", "Tidy up" system-centric; h1 "Welcome back" says nothing |
| 3 | Control | 3 | Esc, confirmed Reset, collapse keeps height; resize only via invisible edge zones |
| 4 | Consistency | 3 | Hero radius-lg/no shadow vs cards radius-xl + --shadow-md (Dashboard.module.css:417-418); grip is a button that does nothing on Enter/Space |
| 5 | Error prevention | 3 | Confirms on reset/delete; east resize zone overlaps card scrollbar (P1) |
| 6 | Recognition | 2 | Resize is cursor-only; keyboard model only in title + hidden text |
| 7 | Flexibility | 3 | Presets, saved layouts, keyboard move/resize, Customize reorder at any width |
| 8 | Minimalist | 2 | Grip on every card at rest, border + shadow on every card, 3 header controls; Layouts vs Customize overlap |
| 9 | Recovery | 3 | Retry exists; per-widget failure indistinguishable from empty |
| 10 | Help | 2 | First-visit page ends in prose, no button (HomeNewVisitorContent.tsx:27) |

## Anti-Patterns Verdict
LLM: not slop; a Linear/Notion user would trust it. Weaknesses are product fit (default reads as chores, not study) and heavy edit affordances.
Deterministic: detect.mjs 0 findings (3rd run: 2 → 0 → 0). Grep: no undefined tokens, outline:none, raw CSS colours, native controls, menu-role mismatch, hand-rolled Esc, or emoji. Remaining: `.importItem:hover` sets border to --border (weaker than resting); GraphPreviewCard.tsx:96 div role=button (works, a <button> is simpler); GraphPreviewCard.tsx:15 theme-blind canvas fallback colour; CustomizePanel hard-coded id "customize-title"; 3 infinite loader durations literal (covered by global reduced-motion).
False positives: dynamic inline styles, 1px hairlines, 7rem composer clearance, local z-index ≤10.

## Priority Issues
1. [P1] East resize zone swallows scrollbar drags. `.rgHandle_e` (Dashboard.module.css:222-228) is right:0, 10px wide, z-index 5, over `.cardBody`'s ~11px scrollbar; Tidy up / Favourites at default height overflow. Grabbing the scrollbar starts a resize. Fix: inset east handle past the scrollbar gutter (or make e/w zones narrow strips on the card's outer border only). Command: harden.
2. [P1] Default doesn't serve the student. Default = Favourites (often empty), Tidy up (chores), Recent imports (often empty) under the hero; a Student preset exists but isn't the default; nothing says "what to study next". Fix: student-forward default (Today + Favourites + Recent, Tidy up last and capped at 2 rows); empty states with a real action. Command: shape / onboard.
3. [P2] Edit affordances heavy and coarse. Grip visible on every card at rest; ArrowRight moves a half card 1 of 12 columns then collides; grip Enter/Space does nothing; help span (DashboardCard.tsx:35) is real DOM text read N times in browse mode. Fix: grip visible on card hover/focus-within only; arrow step = card's own width class; `hidden` on help span (aria-describedby still reads it); aria-roledescription="draggable". Command: polish.
4. [P2] First visit ends in prose; flag set during render. Home.tsx sets `hasvisited` inside the state initializer; page has no primary action. Fix: "Write your first note" button + palette hint; set flag in an effect. Command: onboard.
5. [P3] A11y details. Heatmap data only in per-cell title (ActivityHeatmap.tsx:25) — add a text summary; Rename/Delete in Layouts lack the layout name (LayoutSwitcher.tsx:92,95); hero title ellipsis lacks full-text title. Command: harden.

## Persona Red Flags
Alex: coarse 1-column moves; no shortcut to Customize; Layouts popup has no arrow keys and doesn't take/return focus.
Sam: unnamed Rename/Delete; move help repeated per card; silent heatmap; fixed 20px row heights clip under large text zoom; grip target ~23px.
Priya: below the hero sees empty Favourites, empty imports, chore list; no "study next" cue; doesn't know a Student preset exists; never sees first-visit guidance again.

## Minor Observations
- `.card { user-select: none }` blocks copying previews.
- `.resizeHandle` + `::after` unused (Dashboard.module.css ~538-557).
- `.cardTitle` lacks a hover style.
- Customize lists auto-hiding cards (Also in progress, Background tasks) without saying they only appear when there's something to show.
- Hero skeleton 72px shifts on load.

## Questions to Consider
- What if Home answered only "what should I study next?" and graph/heatmap/hygiene lived behind one "More" disclosure?
- Do students rearrange dashboard cards, or is the free grid a power feature imposed on everyone?
- Should Tidy up be a Home card at all, or a quiet badge on Notes past a threshold?
