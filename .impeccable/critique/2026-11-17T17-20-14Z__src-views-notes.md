---
target: Notes view
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-11-17T17-20-14Z
slug: src-views-notes
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC). Source-only.

## Design Health Score: 28/40 (21 → 26 → 25 → 26 → 28), Good

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | Sorting by Created/Length/Links still shows the updated date (NoteItem.tsx:213) |
| 2 | Real world | 3 | "Status" filter mixes favourites, media and graph jargon ("Orphan") |
| 3 | Control | 3 | Peek has no prev/next |
| 4 | Consistency | 3 | One panel, two names: "Tags & tools" button vs "Note tools" rail title (RightRail.tsx:300) |
| 5 | Error prevention | 3 | Linked + Orphan together silently returns 0 |
| 6 | Recognition | 2 | Card actions hidden until hover; filter chips carry no ARIA state |
| 7 | Flexibility | 3 | No select-all, arrow-key card navigation or bulk tag/move |
| 8 | Minimalist | 3 | Filter bar has ~20 chips and no height cap |
| 9 | Recovery | 3 | Load retry and save retry exist; the failed-save button doesn't look clickable |
| 10 | Help | 2 | Empty state is bare; the Space-to-select hint doesn't say a card must be focused |

## Anti-Patterns Verdict
Not slop.

Remaining tells:
- peek gradient + 4px backdrop blur (NoteModal.module.css:6-7,27)
- cards are competent but anonymous

**Detector**
- Notes-page files: 0 findings.
- Shared Sidebar/TagEditor: 6 findings.
  - Sidebar 12px radius (:160) — TP
  - 3px indicator radius (:222) — likely FP
  - `transition: width` on collapse (:18) — deliberate
  - 1rem × glyphs (TagEditor:63, Sidebar:323)
  - tagline 0.6rem — intentional logo lockup
- `--no-config` adds 3 waived bounce easings in Sidebar.

**Grep true positives**
- EditorPane `flushSave` stale `notes` closure (EditorPane.tsx:160; flows into :220 and :232): pre-existing correctness risk, not visual.
- `'Could not open: ' + String(err)` toast (LinksPanel.tsx:86).
- 4px radius literals (EditorPane.module.css:218, NoteModal.module.css:147).
- Dead `.tabDropEnd` (WorkingNotes.module.css).
- Native checkbox in FocusedScopePanel.tsx:231.

## Overall Impression
Highest score yet. Foundations are done: tokens, saving, keyboard, states, distinct view modes.

Remaining issues are:
- responsive behaviour of the Working Notes header in splits
- identity of "Untitled" notes
- the filter bar

## What's Working
- Save-state design: overdue amber, alert only on failure, fixed width so nothing shifts.
- Selection model: bar shares the count line's box, aria-live, cleanup of filtered-out ids.
- Desk keyboard: roving tabs, Delete to close, keyboard-resizable dividers with ARIA values.

## Priority Issues

**[P1] Working Notes header clips in split/narrow panes (verified)**
- `.header` is a no-wrap flex row with no container query (EditorPane.module.css:13-19).
- Actions are flex-shrink:0 and take ~350px: "Tags & tools", a 7.5rem status, Read/Edit, ⋮, plugin icons.
- `.pane` is overflow:hidden with 2.5rem padding; splits go down to 12%.
- At a 3-way split, ⋮ and the save status get clipped.
- **Fix:** container query (as TabStrip has). Below ~520px: icon-only Tags & tools, hide the "Saved" text (keep overdue/failed), title on its own row, less padding.
- `/impeccable adapt`

**[P1] Untitled notes are indistinguishable**
- Compact rows, tabs (TabStrip.tsx:41) and the "+" button all yield "Untitled".
- A quick-capture session becomes a row of identical tabs.
- **Fix:** derive a display title from the first non-empty content line (muted style) for Compact, tabs and peek labels.
- `/impeccable clarify`

**[P2] Hover overlay covers content; failed-save affordance weak**
- The overlay paints over the last ~125px of the title; in Compact it covers the date, tags and star.
- The failed pill is a borderless mono word.
- No "Retrying…" state is shown.
- Closing the tab cancels pending retries even though the toast promises automatic retry.
- **Fix:** title padding-right while hovered/focused (or fade meta in Compact); failed pill with icon + border + "Retry save"; next-retry hint.
- `/impeccable harden`

**[P2] Filter bar clutter and missing ARIA**
- Chips have no `aria-pressed`; include/exclude state is only "+/−", strikethrough and colour.
- No height cap, so 100+ tags push cards off-screen.
- Two clear controls.
- **Fix:** split Status into Content / Links; `aria-pressed` + aria-label for exclude; cap Tags at 2 lines with "Show all"; rename "Orphan" to "No links".
- `/impeccable distill`

**[P3] Gallery data honesty + performance**
- The card date ignores the sort field.
- Previews are hard-clipped with no fade.
- The Grid fixed 4-line body crops image thumbnails.
- Search lowercases all content per keystroke with no debounce; Length sort recomputes wordCount in the comparator. Costly at 5000 notes.
- `/impeccable optimize` + `/impeccable polish`

## Persona Red Flags
- **Alex (power user):**
  - no select-all or arrow-key card navigation
  - bulk actions limited to workspace/export/delete
  - peek has no prev/next
  - active tab not scrolled into view when many are open
- **Sam (keyboard/screen reader):**
  - 5 tab stops per card
  - chips have no pressed state
  - tag input unlabelled once tags exist
  - no tabpanel link
- **Student organising a term:**
  - no folder/course facet in the gallery
  - "Untitled" lecture dumps unreadable
  - no bulk move-to-folder
  - empty state doesn't mention import/capture

## Minor Observations
- `--text-3` (~3.4:1) on 0.75rem meta text (dates, count, status, Sort/View labels) fails AA for small text. The hint (`--text-2`) is brighter than the count it qualifies.
- `<time>` has no `dateTime` attribute.
- `!important` on colours (NoteItem.module.css:366, 429).
- Empty peek renders a 16px dead tag strip.
- AI "Suggest" chips sit above the body in the peek.

## Questions to Consider
- If a note's identity is its first line, why show the empty title field?
- Should cards show where a note lives (course/folder) as a quiet breadcrumb?
- Does "Saved" need to show at all, or only the exceptions?
