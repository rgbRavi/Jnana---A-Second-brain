---
target: Home dashboard
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-11-18T06-17-44Z
slug: src-views-home-dashboard
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC). Source-only; built-in default layout evaluated. Parent re-verified A's line numbers (several were offset) and dropped one false claim (resize cursor during a move: nwse-resize lives only on .rgHandle_* rules).

## Design Health Score: 26/40, Acceptable (upper), previously 21

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | Skeletons, spinning refresh, live-region move announcements; partial-error notice is plain text, doesn't say what failed |
| 2 | Real world | 3 | "Pick up where you left off", "Tidy up" read well; "Possible connections" / "Notes with no links" still PKM-ish for a first-term student |
| 3 | Control | 3 | Reset/delete confirm, Esc, collapse, presets; no undo for a drag/resize |
| 4 | Consistency | 2 | Layouts popup is `role="menu"` (LayoutSwitcher.tsx:73) with plain buttons, no menuitem roles or arrow keys; card title doubles as collapse button |
| 5 | Error prevention | 3 | Destructive actions confirmed; hide/collapse reversible |
| 6 | Recognition | 2 | Keyboard move/resize documented only in the grip `title` and a 0.75rem Customize footnote; edge resize zones have no visual affordance |
| 7 | Flexibility | 3 | Presets, saved layouts, keyboard move/resize, palette shortcut hint; Quick actions hidden by default |
| 8 | Minimalist | 3 | Calm tokens and restraint; hero (sections.tsx:47) and Continue reading (sections.tsx:120) show the same note twice at the top |
| 9 | Recovery | 2 | "Couldn't load some of this page." (Dashboard.tsx:188) names no source; flat empty states |
| 10 | Help | 2 | No hint that rearranging is safe/reversible; first-visit page has no start button |

## Anti-Patterns Verdict
LLM: passes. No hero-metric row, emoji, eyebrows, gradient text, glass or side stripes. Reads as quiet product UI a Linear/Notion user would trust. Remaining smell: same-weight two-column card grid under the hero; every card repeats grip + chevron + title.
Deterministic: detect.mjs 0 findings on src/views/home. Grep supplement: no undefined tokens (--radius-xs now defined), no outline:none, no raw CSS colours, no native controls, no hand-rolled Esc. Remaining: `var(--border)` on true controls .iconBtn (Dashboard.module.css:54) and .resetBtn (:1123) instead of `--border-control`; infinite loaders with literal durations (taskSlide :992, shimmer :1040, dashSpin :1152) — covered by global reduced-motion, just untokenised; GraphPreviewCard.tsx:15 theme-blind canvas fallback link colour; 0.95rem glyph sizes (:439, :698).
False positives: inline styles are geometry/data; local z-index ≤10; 1px hairline gaps; 7rem composer clearance; `.catch(soft(...))` is logged soft-degrade.

## Priority Issues
1. [P1] Narrow/zoomed windows lose reordering entirely. Below 720px grid stacks and grip + keyboard move are disabled (DashboardGrid.tsx narrow branch); Customize has no reorder; header `.dashboardHeader` (Dashboard.module.css:13-18) has no flex-wrap so title and 4 controls can collide. Fix: Up/Down move buttons per row in Customize (works at every width, keyboard + SR friendly); `flex-wrap: wrap` + `min-width: 0` on header; check `.resume` row wraps. Command: adapt.
2. [P1] Same note twice at the top of the default. Hero uses continueLearning[0]; full-width Continue reading card starts with it again. Fix: Continue reading renders `continueLearning.slice(1)` titled "Also in progress" (hide card content/empty state when nothing remains), or drop it from the default. Command: distill.
3. [P2] Customize + Layouts a11y. Customize dialog has aria-modal but no focus trap (CustomizePanel.tsx:47); Layouts popup claims role="menu" without menuitems/arrow nav; active layout only shown by an aria-hidden check (LayoutSwitcher.tsx:84). Fix: drop role="menu" for a disclosure list with aria-current on the active layout (cheapest, honest); Tab trap in Customize. Command: harden.
4. [P2] Discoverability of the power features. Arrow/Shift+arrow instructions live only in `title` (not reliably read by SR — add aria-describedby) and a footnote; grip at --text-3 is findable but faint. Fix: one visible hint line under the Customize title; grip `aria-describedby` to a shared hidden instruction; grip colour `--control-grip`. Command: polish.
5. [P3] Flat empty/error copy. "No imported files yet." (sections.tsx:224), "Nothing new today yet." (:108), partial-error line. Fix: next-step empty states ("Drop a PDF or recording on the composer to import it"); name the failed source; give the notice a status icon. Command: clarify.

## Persona Red Flags
Alex: no shortcut to open Customize or Layouts; arrow keys only work once a grip is focused; Quick actions off by default; Layouts popup has no arrow-key nav.
Sam: role="menu" mismatch; Tab escapes Customize; arrow-key help only in title; the "preset" tag reads inline with the layout name; heading text announces as "button, expanded" (acceptable but chatty).
Priya: lands on Resume (good, fastest path works), then sees the same note again; Tidy up counts sound like homework at 15 notes; "Not searchable by AI yet" appears even if she never turned AI on.

## Minor Observations
- `.iconBtn`/`.resetBtn` should use `--border-control`.
- HomeReturningVisitorContent.tsx is now a one-line wrapper around <Dashboard />; inline it in Home.tsx.
- `.statIcon` / `.stat*` rules only serve the Workspaces StatCard.
- Customize footnote right-aligned beside Reset competes with it.
- First-visit page has no primary button.
- Tidy up could stay hidden until the vault is big enough to need tidying.

## Questions to Consider
- Hero says "Pick up where you left off"; why does the default also ship a full-width Continue reading card? Which one is the answer?
- Should Tidy up appear on the first screen of a 15-note vault at all, or only once a vault needs it (say 30+ notes)?
- Is a free-form drag/resize grid with invisible edge handles the right "power on demand" for students, or would an ordered list with up/down reorder + presets be calmer and accessible at every width?
