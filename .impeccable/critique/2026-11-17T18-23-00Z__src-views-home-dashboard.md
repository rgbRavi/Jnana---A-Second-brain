---
target: Home dashboard
total_score: 21
p0_count: 0
p1_count: 3
timestamp: 2026-11-17T18-23-00Z
slug: src-views-home-dashboard
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC). Source-only. Line numbers re-verified in parent (A's sections/registry/CustomizePanel lines were offset; corrected below).

## Design Health Score: 21/40, Acceptable (low), first run

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 2 | Skeletons present, but useDashboardData.ts:138-142 `.catch(() => [])`/zero stats turn load failure into a fake empty vault; "Indexed 0%" with AI off unexplained |
| 2 | Real world | 2 | "Orphan notes" / "Need indexing" / "Suggested links" (sections.tsx:154-156) are system terms; "Your knowledge command center" (Dashboard.tsx:162) is SaaS voice |
| 3 | Control | 3 | Collapse/hide/saved layouts reversible; layout delete confirms; Reset has no confirm/undo |
| 4 | Consistency | 2 | Emoji beside lucide; native checkbox CustomizePanel.tsx:44 (SettingToggle mandated); raw `<svg>` Dashboard.tsx:170 in a lucide file; Esc hand-rolled CustomizePanel.tsx:17-21, LayoutSwitcher.tsx:22-28 (not useEscapeKey) |
| 5 | Error prevention | 3 | Grid compaction stops overlap; hidden sections keep position; minW/minH 3 lets a card shrink near-unreadable |
| 6 | Recognition | 2 | Grip `aria-hidden` + title only (DashboardCard.tsx:25); resize = invisible hit zones; hint says "Drag the ⠿ handle" (CustomizePanel.tsx:57) but icon is lucide grip |
| 7 | Flexibility | 2 | No keyboard move/resize; Quick Actions (sections.tsx:57-66) duplicates palette + composer, shows no shortcuts |
| 8 | Minimalist | 1 | 4 stats + 10 equal widgets; Daily Summary (sections.tsx:76) restates the stat row |
| 9 | Recovery | 2 | Indexing failure toast good; load failures silent; `console.error` Dashboard.tsx:95 (should be log.*); recent-import click no-ops when note missing (sections.tsx:216) |
| 10 | Help | 2 | Empty states give next step; nothing explains index/orphan/suggested |

## Anti-Patterns Verdict
LLM: fails product slop test. Reads as a "command center" template, not the calm student tool. Hero-metric template (HeroSection sections.tsx:44-54: 4 identical StatCards, emoji, per-card hex accent, gradient wash Dashboard.module.css:279, hover lift :291 on non-clickable tiles). Identical card grid (10 equal half-width cards, types.ts defaults). Uppercase tracked eyebrows on every card title + subtitle + stat labels. Emoji iconography + streak 🔥 (sections.tsx:84, registry.tsx:39) = toy/gamified anti-reference.
Deterministic: detect.mjs 2 findings on src/views/home — side-tab `.quote` border-left 4px accent (HomeNewVisitorContent.module.css:18, genuine absolute-ban hit, LLM missed it); off-ramp font-size 1rem (HomeReturningVisitorContent.module.css:17). Grep supplement: hex accents sections.tsx:49-51; `color-mix(..., white)` Dashboard.module.css:603 (breaks light themes); `outline: none` HomeReturningVisitorContent.module.css:130; uppercase+tracking at Dashboard.module.css:32,142,310,387,767 + HomeReturning:20; `filter: blur` :497 and scrim `backdrop-filter` :1009 outside `--fx-*`; z-index literals incl. 1100 (:1007); ~25 distinct literal font sizes (0.68–0.95rem near-duplicates); `var(--border)` on clickable cards/inputs (e.g. .favouriteSearch HomeReturning:124 is a real input — should be `--border-control`).
False positives: infinite shimmer/taskSlide animations ARE covered by global reduced-motion override (main.css:307-313); inline styles in DashboardGrid/Skeleton/ProjectCard are dynamic geometry/data; `--surface-2/3` hits are resting fills, not hover overload; GraphPreviewCard rgba values are canvas props (fallback link colour still ignores theme).

## Priority Issues
1. [P1] Hero stat row is the hero-metric template and the wrong first thing. sections.tsx:44-54 + Dashboard.module.css:271-315. Numbers carry no decision ("Projects 0", "Indexed 0%"); hexes break re-theming. Fix: delete stat row + Daily Summary restatement; hero = "Continue where you left off" (top Continue Learning note: title, progress, min left, one button); totals as one quiet line under title. Command: distill, then layout.
2. [P1] Flat default with no hierarchy. 10 equal cards; 5 overlapping action surfaces (Quick Actions, Insights, Favourites, Recent Imports, Graph); graph h=15 (~440px) is loudest, least actionable. Fix: default ~4 cards (Continue Learning full-width first, Favourites, Recent, merged "Tidy up" shown only when counts >0); Graph/Heatmap/Projects/Quick Actions hidden by default, available in Customize. Command: layout + distill.
3. [P1] Core layout interaction not keyboard/SR operable. Grip aria-hidden pointer-only (DashboardCard.tsx:25), resize spans aria-hidden, collapse lacks aria-expanded, cards unnamed `<section>`, absolute positioning may desync DOM vs visual order, no narrow-width breakpoint. WCAG 2.1.1/4.1.2. Fix: grip = `<button aria-label="Move {title}">` with Arrow move / Alt+Arrow resize + aria-live announce; aria-expanded; aria-labelledby; single column under ~720px container width; DOM order by y,x. Command: harden + adapt.
4. [P2] Vocabulary + token drift. Emoji to lucide (or none); sentence-case card titles, no tracking; semantic tokens for accents; `color-mix(... white)` fix; SettingToggle + useEscapeKey in CustomizePanel/LayoutSwitcher; lucide SlidersHorizontal for raw svg; log.error; `.favouriteSearch` focus ring + `--border-control`; `.quote` side stripe on new-visitor page; collapse font sizes to DESIGN.md ramp. Command: polish + typeset.
5. [P2] Fake zeros on failure. useDashboardData.ts:138-142. Fix: "—" for unknown, one inline "Couldn't load some data · Retry", log once; toast when recent-import note is gone. Command: harden.

## Persona Red Flags
Alex (power user): Quick Actions repeat palette/composer without shortcut hints; no keyboard move/resize; hover lift on inert stat tiles fakes interactivity; Refresh gives no "updated" confirmation.
Sam (SR/keyboard/zoom): no keyboard or SR reorder/resize; collapse state unannounced; card titles are buttons not headings, so heading nav finds nothing; InsightCard reads "12 🌱 Orphan notes"; mono uppercase --text-3 labels at ~0.72rem likely under 4.5:1 in some themes; no narrow/zoom breakpoint.
Priya (first-term student, 3rd launch, 15 notes): visit 1 = text wall (HomeNewVisitorContent: "Hello and Welcome To Jnana !"), visit 2+ = 14 widgets, no middle step; hasVisited set on first render; Continue Learning buried 3rd in left column and may be empty if nothing opened; stats read as guilt (orphans, 0%); no review/quiz/flashcard entry on Home despite student-first positioning.

## Minor Observations
- Layout menu titled "Widget Presets", Customize footer says "save layouts from the top dropdown": pick one name (Layouts).
- Reset layout: no confirm, no undo toast.
- Long-title truncation on learn/fav/import rows unverified.
- `byId` rebuilt each render (sections.tsx:207); heatmap/graph uncapped for large vaults.
- New-visitor copy references the composer pill as "Click to take a note box": verify wording against NoteCreator.

## Questions to Consider
- If Home showed one thing to a student opening Jnana at 9pm before an exam, what is it, and why is it the 3rd card today?
- Which of the 14 blocks would anyone miss after a week? If only Continue Learning + Favourites, is the customization UI solving a problem the default created?
- Home's biggest, most colourful tiles reward maintenance (orphans, indexing, untagged). Should a calm second brain push tidying or thinking?
