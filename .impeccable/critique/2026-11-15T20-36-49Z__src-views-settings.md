---
target: Settings view
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-11-15T20-36-49Z
slug: src-views-settings
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC in browser).

## Design Health Score: 28/40 (21 → 26 → 27 → 28)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | Failed test reason only in a toast; status line just "Last test failed" |
| 2 | Real world | 2 | Embeddings/Base URL/tokens in full AI view; "Overall speed" inverted (2× = slower) |
| 3 | Control | 3 | Preset/import/saved-theme clicks discard unsaved custom theme (Reset has Undo); "None (current settings)" no-op |
| 4 | Consistency | 2 | Toggles pin switch right vs action buttons left of control column; loose hints outside row grid; many primaries in Browse/Updates/guide; term drift |
| 5 | Error prevention | 3 | Strong guards; gap = theme switches |
| 6 | Recognition | 3 | Cross-refs plain text not links; key hints behind ⓘ |
| 7 | Flexibility | 3 | / and Ctrl+F, palette, typeahead; no modified markers / per-section reset |
| 8 | Minimalist | 3 | Chip soup + red Uninstall per plugin card; 5-section AI wall |
| 9 | Error recovery | 3 | Excellent AI failure advice; elsewhere toast-only |
| 10 | Help | 3 | Hints, guide, tour; no docs links |

## Anti-Patterns Verdict
Not slop. Detector 0 (standard + layout, with and without config). 91/91 font sizes on ramp, 0 colour/token violations, 0 banned dialogs/raw errors, all 49 htmlFor resolve. Minor TPs: PluginsPanel.module.css:48 pill 7px, Tooltip.module.css:9 off-scale padding, PresetsTab flex ratios inline, AiSettingsPanel:461 hint not described-by.

## Priority Issues
1. [P1] SettingSelect value never announced — button labelled by <label for>/aria-label replaces its content; aria-activedescendant unsupported on button. Fix: APG select-only combobox (role=combobox, aria-labelledby label+value). Also plugin number slider unnamed (PluginSettingsPane:163) and slider aria-labels ≠ visible labels (AdvancedAiPanel 147/164/256). → harden
2. [P1] Non-text contrast 1.4.11 — --border ~1.3:1 vs bg for input/select strokes; select trigger surface-2 ~1.14:1; --surface-hover == --surface-2 so hover invisible. Fix: derived --border-control ≥3:1 in apply.ts; hover → --surface-hover-strong. → audit, polish
3. [P2] AI setup muddled — Web answers / global prompt / chat toolbar under "setup"; 3 names for embeddings; 2 system prompts; saved-setup row ×5. → distill, clarify
4. [P2] Too many primaries — per-card Install/Update primary, "Update all" default; guide ready step 2 primaries. → quieter
5. [P2] Unguarded theme-work loss on preset/plugin/saved/import switch. Reuse Reset's Undo + getThemeVersion. → harden

## Persona Red Flags
Alex: no modified markers/per-section reset; Composer + Reset-theme search entries anchorless; overlay unmovable; Esc from any non-field leaves; "None" no-op.
Sam: select value silent; slider label mismatch; overlay no role/label/focus; search popover stays open on blur; tooltip not hoverable (1.4.13); toast-only errors.
Student: role from onboarding never adapts Settings; guide hidden until Enable AI; Overall speed inverted; red Uninstall + chips; "No backup yet" no nudge.

## Minor
Updates empty state repeats headline; stale "switch on the left" comment; export picker renders under Media row; "Import" title repeated as row label; overlay "Dock back into Settings" doesn't navigate; .guideReady flex on prose; h1 smaller than h2; consent raw ids; FontManager hand-rolled busy; slider focus ring 45% accent; badge title repeats text; derived swatches hover-only.

## Questions
1. Should the onboarding role hide Deep research/Transcription/Web search/AI behaviour for students?
2. Should context budget + Rules reminders live where Rules are picked (Chat → Capabilities)?
3. If every ⓘ were shown and copy cut to fit, would the panel be worse?
