---
target: Notes view
total_score: 25
p0_count: 0
p1_count: 2
timestamp: 2026-11-17T14-46-29Z
slug: src-views-notes
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC in `npm run dev`). Source-only review.

## Design Health Score: 25/40 (21 → 26 → 25)

Score is flat. This reviewer found older bugs no earlier pass had caught: date range off by one, raw auto-tags, favourites desync. None of them comes from the last round. Last round's fixes all hold.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | Favouriting in the peek or editor never updates gallery stars (Notes.tsx:87-103 refetch only on new-note save) |
| 2 | Real world | 2 | Raw auto-tags (`has:videoOrYt`, `has:docxlink`) shown as filter and peek chips; "Back to /search" shows a route path |
| 3 | Control | 3 | Esc, Trash, clear and back all good; back button is icon-only |
| 4 | Consistency | 2 | Export is called "Export" / "Download / Export" / "Download"; two primary-button type styles; 28px tab buttons vs 32px toolbar |
| 5 | Error prevention | 2 | Custom date range off by one, and the end day is excluded |
| 6 | Recognition | 2 | Multi-select taught only by a faint hint; Reading view buried in ⋮; no on-page gallery/desk switch |
| 7 | Flexibility | 3 | Splits, chords and range select; no arrow-key card navigation, select-all or tab overflow list |
| 8 | Minimalist | 3 | Calm at rest; filter bar chip wall; peek stacks a disabled tag editor and AI suggestions above the body |
| 9 | Error recovery | 3 | Autosave toasts once and keeps the draft; gallery load error is a raw string with no retry |
| 10 | Help | 2 | Empty states teach; otherwise tooltips only |

## Anti-Patterns Verdict
Not slop.

- **Detector:** 0 findings in all three modes (normal, layout, `--no-config`); 49 font sizes, all on the ramp.
- **Greps:** 0 raw colours, 0 `console.*`, 0 swallowed catches, 0 `String(err)` toasts, 0 icon-only buttons missing a label.
- **Remaining small true positives:**
  - split / rail resize grips can't be focused or used from the keyboard (SplitContainer.tsx:72-77, RightRail.tsx:241)
  - peek edit inputs use a faint 10% focus ring on `:focus` (NoteModal.module.css:238-261)
  - tab close button nested inside role=tab, with a pointless aria-label on an aria-hidden element (TabStrip.tsx:164-176)
  - animated backdrop blur on the peek (NoteModal.module.css:6-22)

## Overall Impression
Discipline is now real: tokens, one toolbar row, honest saves, keyboard tabs, a Tools button. What's left is mostly data-presentation bugs that make the gallery feel like a dev tool (raw `has:` tags, a date picker a day off, stars that disagree), plus jitter in the save pill.

## What's Working
- Toolbar discipline: every control 2rem, `--border-control`, SettingSelect, lucide icons, accent split button.
- Trust in saving: drafts flush before delete, plugin actions and window close; partial bulk delete is reported exactly and the failures stay selected.
- Keyboard/ARIA basics: roving-tabindex tabs, Delete to close, Shift+F10; peek traps and restores focus; paged rendering with content-visibility.

## Priority Issues

**[P1] Tags filter and peek show raw auto-tags**
- **Problem:** `allTags` includes every `isAutoTag` value (Notes.tsx:225-234), so internal keys show as chips that duplicate the Status and Size chips. TagEditor shows them too (TagEditor.tsx:50-54).
- **Fix:** drop auto-tags from `allTags` and from the peek tag row; add a "Find tag…" input above ~20 tags.
- **Command:** /impeccable distill

**[P1] Custom date range drops a day (verified)**
- **Problem:** `toInput` uses `toISOString()` (UTC) while `fromInput` parses local midnight (NotesFilterBar.tsx:42-43), so east of UTC (IST) the picker shows the previous day. `dateTo` is local midnight, so notes edited on the end day are excluded.
- **Fix:** format the local date; make `dateTo` the end of that day.
- **Command:** /impeccable harden

**[P2] Multi-select hard to discover; grid jumps when it starts**
- **Problem:**
  - The hint is `--text-3` at 0.65 opacity, about 2.3:1 (Notes.module.css:31-34).
  - Revealed card icons sit at 50% opacity, about 2:1, which fails 1.4.11.
  - The selection bar is ~52px tall vs a ~24px count line, so cards jump on the first Ctrl-click, contradicting the comment at :36.
- **Fix:** give the count line the same 2rem box as the bar; hint in `--text-2`; icons at ≥0.7 opacity.
- **Command:** /impeccable polish

**[P2] Save pill jitters and floods screen readers**
- **Problem:** "Unsaved / Saving… / Saved" cycles about every 800ms while typing. The background toggles with `transition: all`, so the width changes and the Tools button slides each cycle (EditorPane.module.css:49-74). `aria-live` announces every cycle (EditorPane.tsx:392-400).
- **Fix:** fixed min-width; quiet text at rest; amber only when a save is overdue or failed; announce failures only.
- **Command:** /impeccable quieter

**[P2] State and copy drift**
- **Problem:** favourites desync (NoteModal.tsx:113-118 and EditorPane.tsx:259-270 emit no event); three names for export; "Back to /search".
- **Fix:** emit `favourite:changed` on eventBus and subscribe in Notes.tsx; one name "Export"; map routes to names ("Back to Search").
- **Command:** /impeccable clarify

## Persona Red Flags
- **Alex (power user):**
  - two steps to edit
  - no arrow-key card navigation or Ctrl+A
  - 4 icons repeated per pane, so 16 in a 2×2 split
  - a narrow split leaves the 1.75rem title only a few characters
- **Sam (keyboard / screen reader):**
  - up to 6 Tab stops per card
  - Space-to-select never announced
  - filter chips lack `aria-pressed`; include/exclude shown only by a "+"/"−" prefix
  - no tabpanel / `aria-controls`
  - split dividers can't be focused
  - the selection live region mounts together with its text, so the first count is likely not announced
- **Student organising a term:**
  - no folder or course facet
  - date filter uses `updatedAt` only
  - course tags buried in the `has:` wall
  - cards show a date only

## Minor Observations
- Grid rows are ragged (align-items:start); stale "CSS columns" comment (NoteItem.module.css:233).
- ~195 lines of dead edit-mode CSS in NoteModal.module.css:163-358.
- Peek Edit button's `title` repeats its visible label.
- Tag remove control is a "×" text glyph (TagEditor.tsx:66).
- RightRail font sizes 0.68rem and 0.82rem are off the ramp.
- Tab close X sits next to the "Close pane" X.
- Loading is the word "Loading…", not a skeleton.
- `grayscale` filter left on lucide chips.
- Filters can be cleared three ways.
- Stale NotesView docstring.

## Questions to Consider
- Should a plain click open the desk, with the peek on Space or a modifier?
- Do four display modes earn their place when two differ only in padding?
- Should `/notes` show an on-page gallery/desk switch?
