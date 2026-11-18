---
target: Settings view
total_score: 21
p0_count: 0
p1_count: 3
timestamp: 2026-11-15T11-17-37Z
slug: src-views-settings
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped: Tauri WebView, `npm run dev` has no IPC.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | AI config save failure only logged (useRag.ts:89-91); Import/Export `busy` never shown on button; plugin Install no in-flight state |
| 2 | Match System / Real World | 2 | Backend, Base URL, chunks, Top-K, drift, A/B, "Pop to overlay" — student-hostile |
| 3 | User Control and Freedom | 2 | Theme Reset no confirm/undo; tab change not in URL; Esc in any text field leaves Settings |
| 4 | Consistency and Standards | 1 | ~5 heading styles, ~10 button classes, 2 switch impls, toggles flip orientation, widths 480/560/none |
| 5 | Error Prevention | 2 | Every Base URL keystroke saves, Rust drops stored API key; adjacent icon-only Trash/Trash2 |
| 6 | Recognition Rather Than Recall | 3 | No panel title; widget-button settings hidden under General → Plugins |
| 7 | Flexibility and Efficiency | 2 | No settings search; sliders 1 step/key (Slow 0–1200ms); select no typeahead |
| 8 | Aesthetic and Minimalist Design | 2 | AI tab = landing page, ~50 controls, 5 preset bars always open; placebo "experimental" options |
| 9 | Error Recovery | 2 | Raw String(err) toasts; no connection test |
| 10 | Help and Documentation | 3 | Excellent inline hints, but --text-3 at 12px (~3.2-3.7:1, fails AA) |
| **Total** | | **21/40** | **Acceptable** |

## Anti-Patterns Verdict
LLM: not slop; token-driven, calm. Reads assembled by many hands. Tells: 3px ::before accent rail on active nav (Settings.module.css:70-79, side-stripe ban, not in DESIGN.md nav-item-active), glass blur + hover lift + `transition: all` on AI .btn (Ai.module.css:134-151), literal rgba(224,82,82,0.12) (ImportExportPanel.module.css:115), five identical stat cards, uppercase mono eyebrows everywhere.
Detector: exit 2, 5 advisory. TP: 7px radius (Appearance.module.css:284), 0.62rem badge (:303), 1.05rem stat (ImportExportPanel.module.css:49). FP: nav rail radius, token fallback. Greps: native checkbox ImportExportPanel.tsx:244; 7 px font-sizes in PluginsPanel.module.css; zero hex/--surface-1/native select. Detector missed the side-stripe rail and the red rgba literal.

## Priority Issues
1. [P1] AI Providers = landing tab + least trustworthy screen. Labels lack htmlFor (AiSettingsPanel.tsx:74-91); Base URL edit drops saved key per keystroke silently; save failure silent; no Test connection; labels 0.72rem uppercase --text-3. Fix: default /settings to general; associate labels; commit Base URL on blur + inline "clears saved key" warning; toast.error on save fail; Test connection; disclose providers behind Enable AI. → harden, distill
2. [P1] Keyboard/SR gaps: SettingSelect no aria-activedescendant/option ids, Tab leaves menu floating; Ai .btn outline:none kills focus ring; About AGPL link <a onClick> no href; nav no aria-current; Theme Studio tabs/Segmented no semantics; orphan labels; toggle hint dropped from accessible name; --text-3 hints fail AA. → audit, harden
3. [P1] IA: 10 flat tabs incl. 1-setting Dashboard; duplicates (Glass ×2, logs ×2, Developer ×2, Advanced ×2); tab not in URL; no panel h2. Fix: grouped nav (App / AI / Data / Extensions / About), Developer behind switch, navigate on tab click, real titles. → layout, clarify
4. [P2] Form vocabulary drift: headings, buttons (Plugins reuses .subnavItem for actions), switches, widths, two primaries in Presets, switch knob --text-1 not --on-accent, eyebrows, rail, rgba literal. Fix: shared Section/Field/Button/width primitives. → polish, typeset
5. [P2] Unguarded/unfinished: Theme Reset, Trash/Trash2, placebo strategies, Restore has no backup-first or Restart, plugin enable/reload unhandled, .catch(console.error) InstalledPlugins.tsx:123,126. → harden

## Persona Red Flags
Alex: no search/palette jump, tabs not bookmarkable, no typeahead, 1-step sliders, export picker no search/select-all.
Sam: unnamed AI inputs, no focus ring on AI buttons, silent listbox, unreachable About link, no headings above h3, Esc in text field navigates away, Theme Studio overlay no Esc.
First-year student: lands on Backend/Base URL/SearXNG; everything shown while AI off; Index disabled with no reason; Top-K/drift; raw onboarding readout in Developer; one-click Reset loses theme work.

## Minor Observations
- Header: Back + 0.7rem eyebrow, no title.
- Theme Studio naming: Pop to overlay / Dock back here / Exit.
- Saved themes don't mark active; uppercase ACTIVE badge.
- SettingToggle hints lowercase em-dash clause vs sentence-case elsewhere.
- Import/Export uses unfiltered notes (ImportExportPanel.tsx:35,93) while Settings filters by vault — verify Export all intent vs vault invariant.
- Switch off-state likely <3:1 non-text contrast.
- Developer A/B metrics buttons in user-facing Advanced AI.

## Questions
1. Why is optional AI both landing tab and densest screen? Guided 3-step setup ending in a passing Test connection?
2. Should Developer/experimental/A-B sit behind one "Show developer options" switch?
3. Is save-per-keystroke a principle or an accident? Should credentials/endpoints commit explicitly?
